import { normalizeName } from "./sports/entities";
import { parseSportsIntent, type SportsIntent } from "./sports/intent";

/**
 * Evidence categories, always stored and shown separately:
 *  1. match_fact           — verified match facts (fixture, stage, confirmed result)
 *  2. search_interest      — Google search surges, Wikipedia reading interest
 *  3. platform_observation — something seen on a specific platform (tool observation, chart, CSV import)
 *  4. creator_reference    — what the creator pasted (never verification)
 *  5. generated_suggestion — model output (e.g. relevance-only hashtags)
 */
export type EvidenceCategory = "match_fact" | "search_interest" | "platform_observation" | "creator_reference" | "generated_suggestion";

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  title: string;
  source: string;
  sourceKey: string;
  sourceUrl: string | null;
  platform: string;
  region: string;
  language: string | null;
  metric: { name: string; value: number | null; scope: string } | null;
  observedAt: string;
  checkedAt: string;
  expiresAt: string | null;
  origin: "auto" | "creator" | "admin";
  related: { matchId: string | null; teamIds: string[]; playerIds: string[]; competitionId: string | null };
  isDemo: boolean;
}

export interface GateContext {
  text: string;
  intent: SportsIntent;
  /** Team ids of the resolved match (if any), so "RCB vs MI" evidence may name either. */
  matchTeamIds: string[];
  /** The resolved match has a live-status provider behind it and is completed. */
  resultVerified: boolean;
  postAt: Date;
  /** Creator region, e.g. "IN", "IN-north", "global". */
  region: string;
}

export interface GateResult {
  pass: boolean;
  reason: string | null;
}

/** Max age at the posting time, per source family. */
export const MAX_EVIDENCE_AGE_H: Record<string, number> = {
  google_trends_rss_in: 48,
  wikimedia_top_in: 72,
  default: 14 * 24,
};

const SOCIAL_OR_CHART = new Set(["apple_music_top_in", "apple_podcasts_top_in", "bluesky_trends", "mastodon_trending_tags"]);
/** Claims we can never verify from any connected source. */
const UNVERIFIABLE = /\b(injur\w*|ruled out|out of (the )?(series|match|tournament|world cup)|playing (xi|11)|line-?ups?|squad (announced|named)|transfer|transfers|signs|signed|joins|joined|rumou?rs?|banned|suspended|retire\w*|record|records|milestone)\b|चोट|रिकॉर्ड|ट्रांसफर/i;
/** Result-type claims: allowed only when a verified completed match backs them. */
const RESULT_CLAIM = /\b(wins?|won|beat|beats|defeat\w*|lost|loses|thrash\w*|draw|drew|score|scored|scores|century|hat-?trick|final score|result)\b|जीता|जीते|हारा|हारे|शतक/i;

/**
 * Teams/players/competition an observation title talks about (same rules as captions).
 * `inSport` is used only for references a person added deliberately: their topic is
 * read in the caption's sport, so "India Pakistan reels" counts for a cricket caption.
 */
export function relatedEntities(title: string, inSport?: "cricket" | "football" | null): EvidenceItem["related"] {
  const i = parseSportsIntent(inSport ? `${title} ${inSport} match` : title);
  return { matchId: null, teamIds: i.teamIds, playerIds: i.playerIds, competitionId: i.competitionId };
}

const songName = (title: string) => title.split(" — ")[0] ?? title;

/**
 * Relevance gates. An item reaches the model only if every gate passes:
 * expiry, timeframe at the posting time, region, same entity/event, no extra
 * teams/players, no unverifiable or unbacked sensitive claim, and chart/social
 * sources only when the creator names that exact thing.
 */
export function gateEvidence(item: EvidenceItem, ctx: GateContext): GateResult {
  const post = ctx.postAt.getTime();
  if (item.expiresAt && new Date(item.expiresAt).getTime() < post) return reject("expired before your posting time");
  if (item.category === "search_interest" || item.category === "platform_observation") {
    const maxH = MAX_EVIDENCE_AGE_H[item.sourceKey] ?? MAX_EVIDENCE_AGE_H.default;
    if (post - new Date(item.observedAt).getTime() > maxH * 3_600_000) return reject("too old for your posting time");
  }
  const itemRegion = item.region.toUpperCase();
  if (ctx.region.startsWith("IN") && itemRegion !== "WORLD" && !itemRegion.startsWith("IN")) {
    return reject(`observed in ${item.region}, not your audience region`);
  }

  // Charts and social lists: only when the creator names that exact song/show/topic.
  if (SOCIAL_OR_CHART.has(item.sourceKey)) {
    const t = normalizeName(item.sourceKey.startsWith("apple_") ? songName(item.title) : item.title.replace(/^#/, ""));
    if (!t || !` ${normalizeName(ctx.text)} `.includes(` ${t} `)) return reject("chart/social item not mentioned in your caption");
  }

  const intent = ctx.intent;
  if (intent.sport) {
    const allowedTeams = new Set([...intent.teamIds, ...ctx.matchTeamIds]);
    const allowedPlayers = new Set(intent.playerIds);
    const r = item.related;
    const sameEntity =
      r.teamIds.some((t) => allowedTeams.has(t)) ||
      r.playerIds.some((p) => allowedPlayers.has(p)) ||
      (r.competitionId !== null && r.competitionId === intent.competitionId && r.teamIds.length === 0 && r.playerIds.length === 0);
    if (!sameEntity) return reject("not about the teams/players in your video");
    const extraTeam = r.teamIds.find((t) => !allowedTeams.has(t));
    if (extraTeam) return reject("also names another team");
    const extraPlayer = r.playerIds.find((p) => !allowedPlayers.has(p));
    if (extraPlayer) return reject("names a player your video doesn't mention");
  }

  if (item.category !== "match_fact") {
    if (UNVERIFIABLE.test(item.title)) return reject("would imply an unverified injury/lineup/transfer/record claim");
    if (RESULT_CLAIM.test(item.title) && !ctx.resultVerified) return reject("would imply a result that isn't verified");
  }
  return { pass: true, reason: null };
}

function reject(reason: string): GateResult {
  return { pass: false, reason };
}

export interface EvidenceBundle {
  items: EvidenceItem[];
  rejected: { title: string; source: string; reason: string }[];
  /** Set when no search-interest or platform item passed: why. */
  noTrendReason: string | null;
}
