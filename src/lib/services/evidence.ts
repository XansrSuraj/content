import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { sourceObservations, type ReferenceSnapshot, type TrendContextItem } from "@/lib/db/schema";
import { gateEvidence, relatedEntities, type EvidenceBundle, type EvidenceItem, type GateContext } from "@/lib/domain/evidence";
import type { SportsIntent } from "@/lib/domain/sports/intent";
import type { MatchRecord, MatchStage } from "@/lib/domain/sports/resolve";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { needsReview } from "@/lib/providers/trends/filters";
import { listReferencesFor, type ReferenceRow } from "@/lib/repo/sports";
import { matchTrends, metricText, tokens } from "./trend-context";

const SEARCH_SOURCES = ["google_trends_rss_in", "wikimedia_top_in"];
const CHART_SOCIAL_SOURCES = ["apple_music_top_in", "apple_podcasts_top_in", "bluesky_trends", "mastodon_trending_tags"];

/** What each metric actually measures — shown with the number so it is never over-read. */
export const METRIC_SCOPE: Record<string, string> = {
  approx_traffic: "Google web searches in India, approximate bucket for a recent surge",
  views_ceil: "Wikipedia pageviews from India for one UTC day, rounded up",
  bluesky_posts: "Bluesky posts worldwide (Bluesky only)",
  mastodon_uses_today: "uses today on mastodon.social only (one Mastodon server)",
  trends_csv: "Google Trends relative interest (0–100) or % rise, from an imported export",
};

const LIMITS = { search_interest: 3, platform_observation: 4, creator_reference: 4 };

type ObsRow = typeof sourceObservations.$inferSelect;

function fromObservation(o: ObsRow, category: EvidenceItem["category"]): EvidenceItem {
  return {
    id: o.id,
    category,
    title: o.title,
    source: SOURCE_NAMES[o.sourceKey] ?? o.sourceKey,
    sourceKey: o.sourceKey,
    sourceUrl: o.url,
    platform: o.platform,
    region: o.geo,
    language: o.language,
    metric: o.metricName ? { name: o.metricName, value: o.metricValue, scope: METRIC_SCOPE[o.metricName] ?? o.metricName } : null,
    observedAt: o.observedAt.toISOString(),
    checkedAt: o.retrievedAt.toISOString(),
    expiresAt: o.expiresAt?.toISOString() ?? null,
    origin: "auto",
    related: relatedEntities(o.title),
    isDemo: o.isDemo,
  };
}

function fromReference(r: ReferenceRow, sport: SportsIntent["sport"]): EvidenceItem {
  return {
    id: r.id,
    category: r.evidenceType === "creator_reference" ? "creator_reference" : "platform_observation",
    title: r.topic,
    source: r.evidenceType === "creator_reference" ? "Creator-provided reference" : `${r.sourceTool} (admin-observed)`,
    sourceKey: `reference:${r.sourceTool}`,
    sourceUrl: r.url,
    platform: r.platform,
    region: r.region,
    language: null,
    metric: r.value !== null ? { name: "trends_csv", value: r.value, scope: METRIC_SCOPE.trends_csv } : null,
    observedAt: r.observedAt.toISOString(),
    checkedAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    origin: r.evidenceType === "creator_reference" ? "creator" : "admin",
    related: relatedEntities(r.topic, sport),
    isDemo: false,
  };
}

/** Cheap pre-filter so the gates only judge items that look related at all. */
function looksRelated(item: EvidenceItem, text: string, intent: SportsIntent, matchTeams: string[]): boolean {
  const ids = new Set([...intent.teamIds, ...intent.playerIds, ...matchTeams]);
  if ([...item.related.teamIds, ...item.related.playerIds].some((x) => ids.has(x))) return true;
  const words = new Set(tokens(text));
  return tokens(item.title).some((w) => w.length >= 4 && words.has(w));
}

export function evidenceNote(i: EvidenceItem): string {
  const when = i.observedAt.slice(0, 16).replace("T", " ");
  const metric = i.metric ? `, ${metricText(i.metric.name, i.metric.value) ?? `${i.metric.value}`} (${i.metric.scope})` : "";
  switch (i.category) {
    case "search_interest":
      return `SEARCH INTEREST (not social-media virality): "${i.title}" — ${i.source}, ${i.region}, observed ${when} UTC${metric}${i.isDemo ? " (demo sample)" : ""}. Use only if it genuinely relates to the video; never call it viral or trending on social media.`;
    case "platform_observation":
      return `PLATFORM OBSERVATION on ${i.platform}: "${i.title}" — ${i.source}, ${i.region}, observed ${when} UTC${metric}. A human/chart observation, not live data; do not claim it is trending now.`;
    case "creator_reference":
      return `REFERENCE (creator-provided, not verified): ${i.platform} — "${i.title}"${i.sourceUrl ? ` — ${i.sourceUrl}` : ""} (added ${when.slice(0, 10)})`;
    default:
      return "";
  }
}

export interface EvidenceResult {
  bundle: EvidenceBundle;
  notes: string[];
  /** Search-interest items in the older shape (messages.context_used). */
  trendItems: TrendContextItem[];
  references: ReferenceSnapshot[];
}

/**
 * Builds the evidence bundle for one caption from cached data only (never waits on
 * a live source). Every item passes the relevance gates or is listed as left out with
 * its reason; categories stay separate.
 */
export async function buildEvidence(
  db: DB,
  userId: string,
  opts: {
    text: string;
    intent: SportsIntent;
    match: MatchRecord | null;
    stage: MatchStage | null;
    publishAt: Date | null;
    region: string;
    useTrends: boolean;
    includeDemo: boolean;
    now?: Date;
  },
): Promise<EvidenceResult> {
  const now = opts.now ?? new Date();
  const postAt = opts.publishAt && opts.publishAt > now ? opts.publishAt : now;
  const matchTeams = opts.match ? [opts.match.homeTeamId, opts.match.awayTeamId].filter((x): x is string => Boolean(x)) : [];
  const ctx: GateContext = {
    text: opts.text,
    intent: opts.intent,
    matchTeamIds: matchTeams,
    resultVerified: Boolean(opts.match && opts.stage === "completed" && opts.match.statusSource === "provider" && opts.match.resultSummary),
    postAt,
    region: opts.region,
  };

  const candidates: EvidenceItem[] = [];
  if (opts.useTrends) {
    const since = new Date(now.getTime() - 72 * 3_600_000);
    const keys = opts.includeDemo ? [...SEARCH_SOURCES, "demo_sample"] : SEARCH_SOURCES;
    const rows = (
      await db
        .select()
        .from(sourceObservations)
        .where(and(inArray(sourceObservations.sourceKey, keys), gte(sourceObservations.observedAt, since), opts.includeDemo ? undefined : eq(sourceObservations.isDemo, false)))
        .orderBy(desc(sourceObservations.observedAt))
        .limit(400)
    ).filter((r) => !needsReview(r.title));
    // Non-sports captions keep the strict word matcher; sports captions are matched on entities.
    const wordMatched = new Set(matchTrends(opts.text, rows, 6).map((t) => t.title.toLowerCase()));
    for (const r of rows) {
      const item = fromObservation(r, "search_interest");
      if (opts.intent.sport ? looksRelated(item, opts.text, opts.intent, matchTeams) : wordMatched.has(r.title.toLowerCase())) candidates.push(item);
    }
    const charts = await db
      .select()
      .from(sourceObservations)
      .where(and(inArray(sourceObservations.sourceKey, CHART_SOCIAL_SOURCES), gte(sourceObservations.retrievedAt, new Date(now.getTime() - 48 * 3_600_000))))
      .orderBy(desc(sourceObservations.retrievedAt))
      .limit(200);
    const lowered = opts.text.toLowerCase();
    for (const c of charts) {
      const name = (c.title.split(" — ")[0] ?? c.title).replace(/^#/, "").toLowerCase();
      if (name.length >= 3 && lowered.includes(name)) candidates.push(fromObservation(c, "platform_observation"));
    }
  }
  for (const r of await listReferencesFor(db, userId, now)) {
    const item = fromReference(r, opts.intent.sport);
    if (looksRelated(item, opts.text, opts.intent, matchTeams)) candidates.push(item);
  }

  const items: EvidenceItem[] = [];
  const rejected: EvidenceBundle["rejected"] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    const key = `${c.category}|${c.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = gateEvidence(c, ctx);
    if (!g.pass) {
      if (rejected.length < 6) rejected.push({ title: c.title, source: c.source, reason: g.reason ?? "not relevant" });
      continue;
    }
    const limit = LIMITS[c.category as keyof typeof LIMITS] ?? 4;
    if ((counts[c.category] ?? 0) >= limit) continue;
    counts[c.category] = (counts[c.category] ?? 0) + 1;
    items.push(c);
  }

  if (opts.match) {
    items.unshift({
      id: opts.match.id,
      category: "match_fact",
      title: `${opts.match.homeName} vs ${opts.match.awayName}`,
      source: opts.match.provider,
      sourceKey: `match:${opts.match.provider}`,
      sourceUrl: opts.match.url,
      platform: opts.match.sport,
      region: "WORLD",
      language: null,
      metric: null,
      observedAt: opts.match.startsAt.toISOString(),
      checkedAt: opts.match.statusCheckedAt.toISOString(),
      expiresAt: null,
      origin: opts.match.statusSource === "creator" ? "creator" : "auto",
      related: { matchId: opts.match.id, teamIds: matchTeams, playerIds: [], competitionId: opts.match.competitionId ?? null },
      isDemo: false,
    });
  }

  const hasTrend = items.some((i) => i.category === "search_interest" || i.category === "platform_observation");
  const noTrendReason = hasTrend
    ? null
    : !opts.useTrends
      ? "Trend context is turned off in your settings."
      : rejected.length
        ? `Found ${rejected.length} possibly related item${rejected.length === 1 ? "" : "s"}, but left ${rejected.length === 1 ? "it" : "them"} out: ${rejected[0].reason}.`
        : "No current Google, Wikipedia or platform item is about this video's subject.";

  const searchItems = items.filter((i) => i.category === "search_interest");
  return {
    bundle: { items, rejected, noTrendReason },
    notes: items.filter((i) => i.category !== "match_fact").map(evidenceNote),
    trendItems: searchItems.map((i) => ({
      title: i.title,
      sourceKey: i.sourceKey,
      sourceName: i.source,
      platform: i.platform,
      geo: i.region,
      observedAt: i.observedAt,
      metric: i.metric ? metricText(i.metric.name, i.metric.value) : null,
      url: i.sourceUrl,
      isDemo: i.isDemo,
      matched: [],
    })),
    references: items
      .filter((i) => i.category === "creator_reference" || (i.category === "platform_observation" && i.origin === "admin"))
      .map((i) => ({
        platform: i.platform,
        topic: i.title,
        url: i.sourceUrl,
        evidenceType: i.origin === "creator" ? "creator_reference" : i.metric ? "csv_import" : "tool_observation",
        sourceTool: i.source.replace(/ \(admin-observed\)$/, ""),
        observedAt: i.observedAt,
      })),
  };
}
