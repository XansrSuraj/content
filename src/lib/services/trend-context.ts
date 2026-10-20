import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { sourceObservations, sources, type TrendContextItem } from "@/lib/db/schema";
import { INGESTIBLE_KEYS, buildConnector, runIngestion } from "@/lib/jobs/ingest";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { STOPWORDS } from "@/lib/providers/ai/template";
import { needsReview } from "@/lib/providers/trends/filters";

/**
 * Finds fresh trend observations that genuinely relate to a caption, so the
 * model can use them as labeled context. Only search-interest / reading-interest
 * sources are used (Google Trends RSS, Wikipedia) — never presented as social
 * virality. YouTube API data is excluded from prompts on purpose.
 */

const CONTEXT_SOURCES = ["google_trends_rss_in", "wikimedia_top_in"];
const DEMO_SOURCES = ["demo_sample"];
const MAX_AGE_HOURS = 48;
const WIKI_LIMIT = 24;

export function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFC")
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
    ),
  ];
}

export interface CandidateObservation {
  title: string;
  sourceKey: string;
  platform: string;
  geo: string;
  observedAt: Date;
  metricName: string | null;
  metricValue: number | null;
  url: string | null;
  isDemo: boolean;
}

/** Source-defined metrics only, described the way the source defines them. */
export function metricText(name: string | null, value: number | null): string | null {
  if (value == null) return null;
  if (name === "approx_traffic") return `Google approx. searches ${value.toLocaleString("en-IN")}+`;
  if (name === "views_ceil") return `Wikipedia views ${value.toLocaleString("en-IN")} (rounded up)`;
  if (name === "bluesky_posts") return `${value.toLocaleString("en-IN")} Bluesky posts`;
  if (name === "mastodon_uses_today") return `${value.toLocaleString("en-IN")} uses today`;
  return null;
}

/** Pure matcher: a title matches when it shares a meaningful word (>= 4 letters) or appears whole in the text. */
export function matchTrends(text: string, candidates: CandidateObservation[], limit = 3): TrendContextItem[] {
  const textTokens = new Set(tokens(text));
  const lowered = text.toLowerCase();
  const scored: { item: TrendContextItem; score: number }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.title.toLowerCase();
    if (seen.has(key)) continue;
    const titleTokens = tokens(c.title).filter((t) => t.length >= 4);
    const matched = titleTokens.filter((t) => textTokens.has(t));
    const whole = key.length >= 4 && lowered.includes(key);
    if (!matched.length && !whole) continue;
    seen.add(key);
    scored.push({
      score: (whole ? 3 : 0) + matched.length / Math.max(1, titleTokens.length),
      item: {
        title: c.title,
        sourceKey: c.sourceKey,
        sourceName: SOURCE_NAMES[c.sourceKey] ?? c.sourceKey,
        platform: c.platform,
        geo: c.geo,
        observedAt: c.observedAt.toISOString(),
        metric: metricText(c.metricName, c.metricValue),
        url: c.url,
        isDemo: c.isDemo,
        matched: whole ? [key] : matched,
      },
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Refreshes every enabled keyless/keyed source whose last run is older than its
 * own interval, in parallel. A run in progress is shared, never duplicated.
 * Bounded by a short timeout so callers are never blocked for long.
 */
const RETRY_AFTER_FAILURE_MINUTES = 5;

export async function refreshIfStale(
  db: DB,
  now: Date = new Date(),
  keys: readonly string[] = INGESTIBLE_KEYS,
  timeoutMs = 6_000,
  attempts = 1,
): Promise<void> {
  const cfg = config();
  const rows = new Map((await db.select().from(sources)).map((r) => [r.key, r]));
  const jobs = keys.map((key) => {
    const connector = buildConnector(key, cfg);
    if (!connector) return null;
    const row = rows.get(key);
    // Fresh enough, or failed moments ago (short backoff instead of waiting a whole interval).
    if (row?.lastSuccessAt && now.getTime() - row.lastSuccessAt.getTime() < connector.minIntervalMinutes * 60_000) return null;
    if (row?.lastRunAt && now.getTime() - row.lastRunAt.getTime() < RETRY_AFTER_FAILURE_MINUTES * 60_000) return null;
    let job = inflight.get(key);
    if (!job) {
      job = runIngestion(db, connector, { trigger: "scheduled", attempts, timeoutMs, now })
        .catch(() => undefined)
        .finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    return job;
  });
  await Promise.all(jobs);
}

export async function findTrendContext(db: DB, text: string, opts: { includeDemo: boolean; now?: Date }): Promise<TrendContextItem[]> {
  const now = opts.now ?? new Date();
  await refreshIfStale(db, now, CONTEXT_SOURCES);
  const since = new Date(now.getTime() - MAX_AGE_HOURS * 3_600_000);
  const keys = opts.includeDemo ? [...CONTEXT_SOURCES, ...DEMO_SOURCES] : CONTEXT_SOURCES;
  const rows = await db
    .select()
    .from(sourceObservations)
    .where(
      and(
        inArray(sourceObservations.sourceKey, keys),
        gte(sourceObservations.observedAt, since),
        opts.includeDemo ? undefined : eq(sourceObservations.isDemo, false),
      ),
    )
    .orderBy(desc(sourceObservations.observedAt))
    .limit(400);
  return matchTrends(text, rows.filter((r) => !needsReview(r.title)));
}

/** How trend context is described to the model: data, clearly scoped, no virality claims. */
export function trendContextNotes(items: TrendContextItem[]): string[] {
  return items.map(
    (i) =>
      `Current search-interest signal (not social-media virality): "${i.title}" — ${i.sourceName}, ${i.geo}, observed ${i.observedAt.slice(0, 16).replace("T", " ")} UTC${i.metric ? `, ${i.metric}` : ""}${i.isDemo ? " (demo sample)" : ""}. Use only if it genuinely relates to the creator's video; never call it viral or trending on social media.`,
  );
}

export interface TrendingNowItem {
  id: string;
  title: string;
  sourceKey: string;
  sourceName: string;
  geo: string;
  observedAt: Date;
  retrievedAt: Date;
  metric: string | null;
  coverageNote: string;
  url: string | null;
  rank: number | null;
}

/** Fresh real observations for the "Trending now" page, newest first, one row per title. */
export async function trendingNow(db: DB, now: Date = new Date()): Promise<{ items: TrendingNowItem[]; hidden: number }> {
  // Only wait for the fast sources this list shows; slower charts refresh in the background (app layout).
  await refreshIfStale(db, now, CONTEXT_SOURCES);
  const since = new Date(now.getTime() - MAX_AGE_HOURS * 3_600_000);
  const rows = await db
    .select()
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.isDemo, false),
        or(
          and(eq(sourceObservations.sourceKey, "google_trends_rss_in"), gte(sourceObservations.observedAt, since)),
          // Wikipedia publishes whole days stamped at 00:00 UTC, so yesterday's list can be up to ~48h "old" when it arrives.
          and(eq(sourceObservations.sourceKey, "wikimedia_top_in"), gte(sourceObservations.observedAt, new Date(now.getTime() - 72 * 3_600_000))),
        ),
      ),
    )
    .orderBy(desc(sourceObservations.retrievedAt), sourceObservations.rank)
    .limit(300);
  const seen = new Set<string>();
  const items: TrendingNowItem[] = [];
  let hidden = 0;
  for (const r of rows) {
    const key = `${r.sourceKey}|${r.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (needsReview(r.title)) {
      hidden++;
      continue;
    }
    items.push({
      id: r.id,
      title: r.title,
      sourceKey: r.sourceKey,
      sourceName: SOURCE_NAMES[r.sourceKey] ?? r.sourceKey,
      geo: r.geo,
      observedAt: r.observedAt,
      retrievedAt: r.retrievedAt,
      metric: metricText(r.metricName, r.metricValue),
      coverageNote: r.coverageNote,
      url: r.url,
      rank: r.rank,
    });
  }
  // Google's live searches first, then Wikipedia's most-read in chart order (top entries only — the page stays scannable).
  const google = items.filter((i) => i.sourceKey === "google_trends_rss_in");
  const wiki = items
    .filter((i) => i.sourceKey === "wikimedia_top_in")
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, WIKI_LIMIT);
  return { items: [...google, ...wiki], hidden };
}

export interface TopSong {
  id: string;
  title: string;
  url: string | null;
  rank: number | null;
  observedAt: Date;
}

/** The latest Apple Music India chart that was fetched (one batch, in chart order). */
export function topSongs(db: DB, limit = 20): Promise<BatchItem[]> {
  return latestBatch(db, "apple_music_top_in", limit);
}

export interface BatchItem extends TopSong {
  metric: string | null;
}

/** The most recent fetch of one source, in its own rank order; sensitive titles are left out. */
export async function latestBatch(db: DB, sourceKey: string, limit = 20): Promise<BatchItem[]> {
  const rows = await db
    .select()
    .from(sourceObservations)
    .where(eq(sourceObservations.sourceKey, sourceKey))
    .orderBy(desc(sourceObservations.retrievedAt), sourceObservations.rank)
    .limit(100);
  const latest = rows[0]?.retrievedAt.getTime();
  return rows
    .filter((r) => r.retrievedAt.getTime() === latest && !needsReview(r.title))
    .slice(0, limit)
    .map((r) => ({ id: r.id, title: r.title, url: r.url, rank: r.rank, observedAt: r.observedAt, metric: metricText(r.metricName, r.metricValue) }));
}
