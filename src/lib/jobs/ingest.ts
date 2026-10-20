import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { AppConfig } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { ingestionRuns, sourceObservations, sources } from "@/lib/db/schema";
import { SOURCE_NAMES, sourceStatus } from "@/lib/providers/trends/catalog";
import { SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "@/lib/providers/trends/types";
import { GoogleTrendsRssConnector } from "@/lib/providers/trends/google-trends-rss";
import { WikimediaTopInConnector } from "@/lib/providers/trends/wikimedia";
import { YouTubeMostPopularConnector } from "@/lib/providers/trends/youtube";

export const INGESTIBLE_KEYS = ["wikimedia_top_in", "google_trends_rss_in", "youtube_most_popular_in"] as const;

export function buildConnector(key: string, cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): TrendSourceConnector | null {
  if (sourceStatus(key, cfg).status !== "enabled") return null;
  if (key === "wikimedia_top_in") return new WikimediaTopInConnector(cfg.sources.wikimediaUserAgent!);
  if (key === "google_trends_rss_in") return new GoogleTrendsRssConnector(cfg.sources.userAgent);
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

  const [run] = await db.insert(ingestionRuns).values({ sourceKey: key, status: "running", trigger: opts.trigger }).returning();

  let lastError = "";
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
      await db.update(sources).set({ lastRunAt: now, lastSuccessAt: now, lastError: null }).where(eq(sources.key, key));
      return { sourceKey: key, status: "success", itemsFetched: fetched.length, itemsNew, purged: purged.length };
    } catch (err) {
      const retryable = err instanceof SourceFetchError ? err.retryable : err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || err.name === "TypeError");
      lastError = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "Unknown error";
      if (!retryable || attempt === attempts) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  await db
    .update(ingestionRuns)
    .set({ status: "failed", attempts: made, finishedAt: new Date(), error: lastError })
    .where(eq(ingestionRuns.id, run.id));
  await db.update(sources).set({ lastRunAt: now, lastError: lastError }).where(eq(sources.key, key));
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
