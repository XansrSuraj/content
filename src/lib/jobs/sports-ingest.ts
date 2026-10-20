import { and, eq, gte, inArray } from "drizzle-orm";
import type { AppConfig } from "@/lib/config";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { ingestionRuns, sources } from "@/lib/db/schema";
import { SOURCE_NAMES, sourceStatus } from "@/lib/providers/trends/catalog";
import { CricApiConnector, FootballDataConnector, OpenFootballConnector, type SportsConnector } from "@/lib/providers/sports/connectors";
import { SourceFetchError } from "@/lib/providers/trends/types";
import { purgeOldMatches, upsertMatches } from "@/lib/repo/sports";
import type { Sport } from "@/lib/domain/sports/entities";

export const SPORTS_KEYS = ["openfootball_fixtures", "football_data", "cricapi"] as const;
const SPORT_OF: Record<(typeof SPORTS_KEYS)[number], Sport> = { openfootball_fixtures: "football", football_data: "football", cricapi: "cricket" };

export function buildSportsConnector(key: string, cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): SportsConnector | null {
  if (sourceStatus(key, cfg).status !== "enabled") return null;
  if (key === "openfootball_fixtures") return new OpenFootballConnector(cfg.sources.userAgent);
  if (key === "football_data") return new FootballDataConnector(env.FOOTBALL_DATA_TOKEN!.trim());
  if (key === "cricapi") return new CricApiConnector(env.CRICAPI_KEY!.trim());
  return null;
}

export interface SportsIngestResult {
  sourceKey: string;
  status: "success" | "failed" | "skipped";
  matches: number;
  error?: string;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Fetches one provider into the shared match table, within its interval and daily call cap. */
export async function runSportsIngestion(
  db: DB,
  connector: SportsConnector,
  opts: { now?: Date; timeoutMs?: number; force?: boolean } = {},
): Promise<SportsIngestResult> {
  const now = opts.now ?? new Date();
  const key = connector.key;
  await db.insert(sources).values({ key, name: SOURCE_NAMES[key] ?? key }).onConflictDoNothing();
  const [src] = await db.select().from(sources).where(eq(sources.key, key));
  if (!opts.force && src?.lastSuccessAt && now.getTime() - src.lastSuccessAt.getTime() < connector.minIntervalMinutes * 60_000) {
    return { sourceKey: key, status: "skipped", matches: 0 };
  }
  // Daily hard cap: count today's real runs (success or failed both spent quota).
  const runsToday = await db
    .select({ id: ingestionRuns.id })
    .from(ingestionRuns)
    .where(and(eq(ingestionRuns.sourceKey, key), gte(ingestionRuns.startedAt, startOfUtcDay(now)), inArray(ingestionRuns.status, ["success", "failed"])));
  if ((runsToday.length + 1) * connector.callsPerRun > connector.dailyCallCap) {
    return { sourceKey: key, status: "skipped", matches: 0, error: "Daily call cap reached" };
  }

  const [run] = await db.insert(ingestionRuns).values({ sourceKey: key, status: "running", trigger: "scheduled" }).returning();
  try {
    const rows = await connector.fetch(AbortSignal.timeout(opts.timeoutMs ?? 20_000), now);
    const n = await upsertMatches(db, rows);
    await purgeOldMatches(db, new Date(now.getTime() - 14 * 86_400_000));
    await db.update(ingestionRuns).set({ status: "success", attempts: 1, finishedAt: new Date(), itemsFetched: rows.length, itemsNew: n }).where(eq(ingestionRuns.id, run.id));
    await db.update(sources).set({ lastRunAt: now, lastSuccessAt: now, lastError: null }).where(eq(sources.key, key));
    return { sourceKey: key, status: "success", matches: n };
  } catch (err) {
    const msg = err instanceof SourceFetchError || err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "Unknown error";
    await db.update(ingestionRuns).set({ status: "failed", attempts: 1, finishedAt: new Date(), error: msg }).where(eq(ingestionRuns.id, run.id));
    await db.update(sources).set({ lastRunAt: now, lastError: msg }).where(eq(sources.key, key));
    return { sourceKey: key, status: "failed", matches: 0, error: msg };
  }
}

const inflight = new Map<string, Promise<SportsIngestResult>>();
const RETRY_AFTER_FAILURE_MINUTES = 5;

/** Refreshes every enabled fixtures provider that is due (optionally only for one sport). Shared runs, never duplicated. */
export async function refreshSportsIfStale(db: DB, opts: { now?: Date; timeoutMs?: number; sport?: Sport } = {}): Promise<void> {
  const cfg = config();
  const now = opts.now ?? new Date();
  const rows = new Map((await db.select().from(sources)).map((r) => [r.key, r]));
  await Promise.all(
    SPORTS_KEYS.filter((k) => !opts.sport || SPORT_OF[k] === opts.sport).map((key) => {
      const c = buildSportsConnector(key, cfg);
      if (!c) return null;
      const row = rows.get(key);
      if (row?.lastSuccessAt && now.getTime() - row.lastSuccessAt.getTime() < c.minIntervalMinutes * 60_000) return null;
      if (row?.lastRunAt && now.getTime() - row.lastRunAt.getTime() < RETRY_AFTER_FAILURE_MINUTES * 60_000) return null;
      let job = inflight.get(key);
      if (!job) {
        job = runSportsIngestion(db, c, { now, timeoutMs: opts.timeoutMs }).finally(() => inflight.delete(key));
        inflight.set(key, job);
      }
      return job.catch(() => undefined);
    }),
  );
}
