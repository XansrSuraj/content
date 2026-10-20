import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { AppConfig } from "@/lib/config";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { ingestionRuns, sources, sportsMatches } from "@/lib/db/schema";
import { SOURCE_NAMES, sourceStatus } from "@/lib/providers/trends/catalog";
import {
  CricApiProvider,
  FootballDataProvider,
  OpenFootballProvider,
  OpenLigaDbProvider,
  RateLimitedError,
  type MatchProvider,
} from "@/lib/providers/sports/connectors";
import { SourceFetchError } from "@/lib/providers/trends/types";
import { purgeOldMatches, upsertMatches } from "@/lib/repo/sports";
import { reserveCalls, usageToday } from "@/lib/repo/provider-usage";
import { acquireLock, backoffMs, pausedUntil, recordFailure, recordSuccess, releaseLock, retryable } from "./guard";
import { EXPECTED_DURATION_H } from "@/lib/domain/sports/resolve";
import type { Sport } from "@/lib/domain/sports/entities";

export const SPORTS_KEYS = ["openligadb", "openfootball_fixtures", "football_data", "cricapi"] as const;
const SPORT_OF: Record<(typeof SPORTS_KEYS)[number], Sport> = { openligadb: "football", openfootball_fixtures: "football", football_data: "football", cricapi: "cricket" };
/** Provider key → the `provider` value written on its rows. */
const ROW_PROVIDER: Record<string, string> = { openligadb: "openligadb", openfootball_fixtures: "openfootball", football_data: "football_data", cricapi: "cricapi" };

export function buildSportsConnector(key: string, cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): MatchProvider | null {
  if (sourceStatus(key, cfg).status !== "enabled") return null;
  if (key === "openligadb") return new OpenLigaDbProvider(cfg.sources.userAgent);
  if (key === "openfootball_fixtures") return new OpenFootballProvider(cfg.sources.userAgent);
  if (key === "football_data") return new FootballDataProvider(env.FOOTBALL_DATA_TOKEN!.trim());
  if (key === "cricapi") return new CricApiProvider(env.CRICAPI_KEY!.trim());
  return null;
}

export interface SportsIngestResult {
  sourceKey: string;
  status: "success" | "failed" | "skipped";
  matches: number;
  error?: string;
}

/** True when one of this provider's stored matches is in its play window (then it is polled faster). */
export async function inPlayWindow(db: DB, provider: MatchProvider, now: Date): Promise<boolean> {
  const rowProvider = ROW_PROVIDER[provider.key] ?? provider.key;
  const hours = EXPECTED_DURATION_H[provider.sport];
  const rows = await db
    .select({ id: sportsMatches.id })
    .from(sportsMatches)
    .where(
      and(
        isNull(sportsMatches.ownerId),
        sql`${sportsMatches.providerIds} ? ${rowProvider}`,
        gte(sportsMatches.startsAt, new Date(now.getTime() - hours * 3_600_000)),
        lte(sportsMatches.startsAt, new Date(now.getTime() + 15 * 60_000)),
        inArray(sportsMatches.status, ["scheduled", "live", "unknown"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Minutes until this provider is due: faster during play, halved frequency once 80% of today's budget is used. */
export async function dueIntervalMinutes(db: DB, provider: MatchProvider, now: Date): Promise<number> {
  const base = (await inPlayWindow(db, provider, now)) ? provider.intervals.liveMin : provider.intervals.fixturesMin;
  const used = (await usageToday(db, now)).get(provider.key) ?? 0;
  return used >= provider.budget.perDay * 0.8 ? base * 2 : base;
}

/**
 * Fetches one provider into the shared match table (fetch per match, used by every
 * creator). Never overwrites good data with a failure, and only marks success on a real success.
 */
export async function runSportsIngestion(
  db: DB,
  provider: MatchProvider,
  opts: { now?: Date; timeoutMs?: number; force?: boolean; attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<SportsIngestResult> {
  const now = opts.now ?? new Date();
  const key = provider.key;
  await db.insert(sources).values({ key, name: SOURCE_NAMES[key] ?? key }).onConflictDoNothing();
  const [src] = await db.select().from(sources).where(eq(sources.key, key));
  if (!opts.force && src?.lastSuccessAt && now.getTime() - src.lastSuccessAt.getTime() < (await dueIntervalMinutes(db, provider, now)) * 60_000) {
    return { sourceKey: key, status: "skipped", matches: 0 };
  }
  const paused = opts.force ? null : pausedUntil(src, now);
  if (paused) return { sourceKey: key, status: "skipped", matches: 0, error: `Paused until ${paused.toISOString()}` };
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const attempts = opts.attempts ?? 2;
  if (!(await acquireLock(db, key, timeoutMs * attempts + 10_000, now))) return { sourceKey: key, status: "skipped", matches: 0, error: "Already running" };
  try {
    const started = Date.now();
    const [run] = await db.insert(ingestionRuns).values({ sourceKey: key, status: "running", trigger: "scheduled" }).returning();
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      // Every attempt spends real calls, so each one reserves budget first.
      const quota = await reserveCalls(db, key, provider.callsPerList, provider.budget, now);
      if (!quota.ok) {
        await db.update(ingestionRuns).set({ status: "skipped", attempts: attempt - 1, finishedAt: new Date(), error: "Budget reached" }).where(eq(ingestionRuns.id, run.id));
        return { sourceKey: key, status: "skipped", matches: 0, error: "Budget reached (day or minute)" };
      }
      try {
        const range = { from: new Date(now.getTime() - 10 * 86_400_000), to: new Date(now.getTime() + 14 * 86_400_000) };
        const rows = await provider.listFixtures(range, AbortSignal.timeout(timeoutMs), now);
        const n = await upsertMatches(db, rows);
        await purgeOldMatches(db, new Date(now.getTime() - 14 * 86_400_000));
        await db.update(ingestionRuns).set({ status: "success", attempts: attempt, finishedAt: new Date(), itemsFetched: rows.length, itemsNew: n }).where(eq(ingestionRuns.id, run.id));
        await recordSuccess(db, key, now, Date.now() - started);
        return { sourceKey: key, status: "success", matches: n };
      } catch (err) {
        lastErr = err;
        if (!retryable(err) || attempt === attempts) break;
        await (opts.sleep ?? defaultSleep)(backoffMs(attempt));
      }
    }
    const msg =
      lastErr instanceof RateLimitedError
        ? `Rate limited${lastErr.retryAfterSeconds !== null ? ` (retry after ${lastErr.retryAfterSeconds}s)` : ""}`
        : lastErr instanceof SourceFetchError || lastErr instanceof Error
          ? `${lastErr.name}: ${lastErr.message}`.slice(0, 300)
          : "Unknown error";
    await db.update(ingestionRuns).set({ status: "failed", attempts, finishedAt: new Date(), error: msg }).where(eq(ingestionRuns.id, run.id));
    // Last-known-good matches stay; only the failure counters change (may open the circuit).
    await recordFailure(db, key, now, msg, Date.now() - started, lastErr);
    return { sourceKey: key, status: "failed", matches: 0, error: msg };
  } finally {
    await releaseLock(db, key);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const inflight = new Map<string, Promise<SportsIngestResult>>();
const RETRY_AFTER_FAILURE_MINUTES = 5;

/** Refreshes every enabled fixtures provider that is due (optionally only for one sport). Shared runs, never duplicated. */
export async function refreshSportsIfStale(db: DB, opts: { now?: Date; timeoutMs?: number; sport?: Sport } = {}): Promise<void> {
  const cfg = config();
  const now = opts.now ?? new Date();
  const rows = new Map((await db.select().from(sources)).map((r) => [r.key, r]));
  await Promise.all(
    SPORTS_KEYS.filter((k) => !opts.sport || SPORT_OF[k] === opts.sport).map(async (key) => {
      const p = buildSportsConnector(key, cfg);
      if (!p) return;
      const row = rows.get(key);
      if (row?.lastSuccessAt && now.getTime() - row.lastSuccessAt.getTime() < (await dueIntervalMinutes(db, p, now)) * 60_000) return;
      if (row?.lastRunAt && now.getTime() - row.lastRunAt.getTime() < RETRY_AFTER_FAILURE_MINUTES * 60_000) return;
      let job = inflight.get(key);
      if (!job) {
        job = runSportsIngestion(db, p, { now, timeoutMs: opts.timeoutMs }).finally(() => inflight.delete(key));
        inflight.set(key, job);
      }
      await job.catch(() => undefined);
    }),
  );
}
