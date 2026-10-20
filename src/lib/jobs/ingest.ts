import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { AppConfig } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { ingestionRuns, sourceObservations, sources } from "@/lib/db/schema";
import { SOURCE_NAMES, sourceStatus } from "@/lib/providers/trends/catalog";
import { type FetchedObservation, type TrendSourceConnector } from "@/lib/providers/trends/types";
import { acquireLock, backoffMs, pausedUntil, recordFailure, recordSuccess, releaseLock, retryable } from "./guard";
import { GoogleTrendsRssConnector } from "@/lib/providers/trends/google-trends-rss";
import { WikimediaTopInConnector } from "@/lib/providers/trends/wikimedia";
import { AppleChartConnector, AppleMusicTopConnector } from "@/lib/providers/trends/apple-music";
import { BlueskyTrendsConnector, MastodonTrendingTagsConnector } from "@/lib/providers/trends/social";
import { YouTubeMostPopularConnector } from "@/lib/providers/trends/youtube";

export const INGESTIBLE_KEYS = [
  "wikimedia_top_in",
  "google_trends_rss_in",
  "apple_music_top_in",
  "apple_podcasts_top_in",
  "bluesky_trends",
  "mastodon_trending_tags",
  "youtube_most_popular_in",
] as const;

export function buildConnector(key: string, cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): TrendSourceConnector | null {
  if (sourceStatus(key, cfg).status !== "enabled") return null;
  if (key === "wikimedia_top_in") return new WikimediaTopInConnector(cfg.sources.wikimediaUserAgent!);
  if (key === "google_trends_rss_in") return new GoogleTrendsRssConnector(cfg.sources.userAgent);
  if (key === "apple_music_top_in") return new AppleMusicTopConnector(cfg.sources.userAgent);
  if (key === "apple_podcasts_top_in") return new AppleChartConnector(cfg.sources.userAgent, "podcasts");
  if (key === "bluesky_trends") return new BlueskyTrendsConnector(cfg.sources.userAgent);
  if (key === "mastodon_trending_tags") return new MastodonTrendingTagsConnector(cfg.sources.userAgent);
  if (key === "youtube_most_popular_in") return new YouTubeMostPopularConnector(env.YOUTUBE_API_KEY!.trim());
  return null;
}

export interface IngestOptions {
  trigger: "manual" | "cli" | "scheduled" | "test";
  force?: boolean;
  attempts?: number;
  timeoutMs?: number;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface IngestResult {
  sourceKey: string;
  status: "success" | "failed" | "skipped";
  itemsFetched: number;
  itemsNew: number;
  purged: number;
  error?: string;
}

export function dedupeKey(sourceKey: string, o: FetchedObservation): string {
  // One observation per source item, geography and observation hour.
  const hour = o.observedAt.toISOString().slice(0, 13);
  return `${sourceKey}|${o.externalId}|${o.geo}|${hour}`;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runIngestion(db: DB, connector: TrendSourceConnector, opts: IngestOptions): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const sleep = opts.sleep ?? defaultSleep;
  const key = connector.key;

  await db
    .insert(sources)
    .values({ key, name: SOURCE_NAMES[key] ?? key })
    .onConflictDoNothing();

  // Expired rows (e.g. YouTube 30-day policy) are purged on every run.
  const purged = await db
    .delete(sourceObservations)
    .where(and(isNotNull(sourceObservations.expiresAt), lt(sourceObservations.expiresAt, now)))
    .returning({ id: sourceObservations.id });

  // Freshness check: skip if the source was fetched successfully recently.
  const [src] = await db.select().from(sources).where(eq(sources.key, key));
  if (!opts.force && src?.lastSuccessAt && now.getTime() - src.lastSuccessAt.getTime() < connector.minIntervalMinutes * 60_000) {
    await db.insert(ingestionRuns).values({
      sourceKey: key,
      status: "skipped",
      trigger: opts.trigger,
      finishedAt: now,
      error: `Fetched less than ${connector.minIntervalMinutes} minutes ago`,
    });
    return { sourceKey: key, status: "skipped", itemsFetched: 0, itemsNew: 0, purged: purged.length };
  }

  // Circuit breaker and lock: a paused or already-running source is skipped (manual runs ignore the pause).
  const paused = opts.force ? null : pausedUntil(src, now);
  if (paused) return { sourceKey: key, status: "skipped", itemsFetched: 0, itemsNew: 0, purged: purged.length, error: `Paused until ${paused.toISOString()}` };
  if (!(await acquireLock(db, key, timeoutMs * attempts + 10_000, now))) {
    return { sourceKey: key, status: "skipped", itemsFetched: 0, itemsNew: 0, purged: purged.length, error: "Already running" };
  }
  try {
    return await runLocked(db, connector, opts, { now, attempts, timeoutMs, sleep, purged: purged.length });
  } finally {
    await releaseLock(db, key);
  }
}

async function runLocked(
  db: DB,
  connector: TrendSourceConnector,
  opts: IngestOptions,
  x: { now: Date; attempts: number; timeoutMs: number; sleep: (ms: number) => Promise<void>; purged: number },
): Promise<IngestResult> {
  const { now, attempts, timeoutMs, sleep } = x;
  const key = connector.key;
  const purged = { length: x.purged };
  const started = Date.now();
  const [run] = await db.insert(ingestionRuns).values({ sourceKey: key, status: "running", trigger: opts.trigger }).returning();

  let lastError = "";
  let lastErr: unknown = null;
  let made = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    made = attempt;
    try {
      const fetched = await connector.fetch(AbortSignal.timeout(timeoutMs), now);
      let itemsNew = 0;
      for (const o of fetched) {
        const inserted = await db
          .insert(sourceObservations)
          .values({
            sourceKey: key,
            dedupeKey: dedupeKey(key, o),
            externalId: o.externalId,
            title: o.title.slice(0, 300),
            url: o.url,
            observedAt: o.observedAt,
            retrievedAt: now,
            geo: o.geo,
            language: o.language,
            platform: o.platform,
            rank: o.rank,
            metricName: o.metricName,
            metricValue: o.metricValue,
            coverageNote: o.coverageNote,
            hashtags: o.hashtags,
            expiresAt: o.expiresAt,
            isDemo: false,
          })
          .onConflictDoNothing()
          .returning({ id: sourceObservations.id });
        itemsNew += inserted.length;
      }
      await db
        .update(ingestionRuns)
        .set({ status: "success", attempts: attempt, finishedAt: new Date(), itemsFetched: fetched.length, itemsNew })
        .where(eq(ingestionRuns.id, run.id));
      await recordSuccess(db, key, now, Date.now() - started);
      return { sourceKey: key, status: "success", itemsFetched: fetched.length, itemsNew, purged: purged.length };
    } catch (err) {
      lastErr = err;
      lastError = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "Unknown error";
      if (!retryable(err) || attempt === attempts) break;
      await sleep(backoffMs(attempt));
    }
  }

  await db
    .update(ingestionRuns)
    .set({ status: "failed", attempts: made, finishedAt: new Date(), error: lastError })
    .where(eq(ingestionRuns.id, run.id));
  // Last-known-good observations stay; only the failure counters change (may open the circuit).
  await recordFailure(db, key, now, lastError, Date.now() - started, lastErr);
  return { sourceKey: key, status: "failed", itemsFetched: 0, itemsNew: 0, purged: purged.length, error: lastError };
}

export async function runAllEnabled(db: DB, cfg: AppConfig, opts: IngestOptions): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const key of INGESTIBLE_KEYS) {
    const connector = buildConnector(key, cfg);
    if (!connector) {
      results.push({ sourceKey: key, status: "skipped", itemsFetched: 0, itemsNew: 0, purged: 0, error: "Not configured" });
      continue;
    }
    results.push(await runIngestion(db, connector, opts));
  }
  return results;
}
