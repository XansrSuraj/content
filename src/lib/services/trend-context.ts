import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { sourceObservations, sources, type TrendContextItem } from "@/lib/db/schema";
import { buildConnector, runIngestion } from "@/lib/jobs/ingest";
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
const REFRESH_AFTER_MINUTES = 120;

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

/** Refreshes the Google Trends feed when stale. Bounded by a short timeout so captions are never blocked for long. */
export async function refreshIfStale(db: DB, now: Date = new Date()): Promise<void> {
  const cfg = config();
  const connector = buildConnector("google_trends_rss_in", cfg);
  if (!connector) return;
  const [src] = await db.select().from(sources).where(eq(sources.key, connector.key));
  if (src?.lastRunAt && now.getTime() - src.lastRunAt.getTime() < REFRESH_AFTER_MINUTES * 60_000) return;
  await runIngestion(db, connector, { trigger: "scheduled", attempts: 1, timeoutMs: 6_000, now }).catch(() => undefined);
}

export async function findTrendContext(db: DB, text: string, opts: { includeDemo: boolean; now?: Date }): Promise<TrendContextItem[]> {
  const now = opts.now ?? new Date();
  await refreshIfStale(db, now);
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
  await refreshIfStale(db, now);
  const since = new Date(now.getTime() - MAX_AGE_HOURS * 3_600_000);
  const rows = await db
    .select()
    .from(sourceObservations)
    .where(and(inArray(sourceObservations.sourceKey, CONTEXT_SOURCES), gte(sourceObservations.observedAt, since), eq(sourceObservations.isDemo, false)))
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
  return { items, hidden };
}
