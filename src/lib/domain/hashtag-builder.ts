import { normalizeHashtag } from "./hashtags";
import { COMPETITION_BY_ID, PLAYER_BY_ID, TEAM_BY_ID } from "./sports/entities";
import { parseSportsIntent, type SportsIntent } from "./sports/intent";
import { getPlatform } from "./platforms";
import { KIND_TO_VARIANT, type CaptionResult } from "./captions";

/** Generic engagement filler: never suggested by default (no trend or relevance meaning). */
export const FILLER_HASHTAGS = new Set(
  [
    "viral", "viralvideo", "viralreels", "viralpost", "fyp", "foryou", "foryoupage", "fy", "trending", "trendingreels", "trendingnow", "explore",
    "explorepage", "explorepage✨", "instagood", "instadaily", "like4like", "likeforlike", "follow4follow", "followforfollow", "followme",
    "reels", "reelsinstagram", "reelitfeelit", "reelkarofeelkaro", "instareels", "youtube", "youtuber", "subscribe", "tiktok", "shortsvideo",
    "viralshorts", "trendingshorts",
  ].map((t) => t.toLowerCase()),
);

/** "#RCBvsMI" → "RCB vs MI", "#ViratKohli" → "Virat Kohli" (to read which entities a tag names). */
export function tagWords(tag: string): string {
  return tag
    .replace(/^#/, "")
    .replace(/(vs)(?=[A-Z])/g, " vs ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

const pascal = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

export interface HashtagCandidate {
  tag: string;
  reason: string;
}

const INTENT_TAGS: Partial<Record<SportsIntent["contentType"], (sport: string) => string>> = {
  preview: () => "#MatchPreview",
  prediction: () => "#MatchPrediction",
  recap: () => "#MatchHighlights",
  analysis: () => "#MatchAnalysis",
  historical_highlight: (sport) => (sport === "cricket" ? "#CricketThrowback" : "#FootballThrowback"),
};

/**
 * Relevance-only candidates from confirmed content: the resolved/named teams,
 * their fixture tag, the competition, players the creator mentions, and the video type.
 */
export function entityHashtags(intent: SportsIntent, matchTeamIds: string[] = []): HashtagCandidate[] {
  if (!intent.sport) return [];
  const out: HashtagCandidate[] = [];
  const teamIds = [...new Set([...matchTeamIds, ...intent.teamIds])].slice(0, 2);
  const teams = teamIds.map((id) => TEAM_BY_ID.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (teams.length === 2) out.push({ tag: `#${teams[0].short.replace(/-W$/, "W")}vs${teams[1].short.replace(/-W$/, "W")}`, reason: "The match in your video" });
  for (const t of teams) out.push({ tag: `#${pascal(t.name)}`, reason: "Team in your video" });
  const comp = intent.competitionId ? COMPETITION_BY_ID.get(intent.competitionId) : undefined;
  if (comp) out.push({ tag: `#${comp.aliases[0].length <= 4 ? comp.aliases[0].toUpperCase() : pascal(comp.name)}`, reason: "Competition" });
  for (const id of intent.playerIds.slice(0, 2)) {
    const p = PLAYER_BY_ID.get(id);
    if (p) out.push({ tag: `#${pascal(p.name)}`, reason: "Player you mention" });
  }
  const intentTag = INTENT_TAGS[intent.contentType]?.(intent.sport);
  if (intentTag) out.push({ tag: intentTag, reason: "What your video is" });
  out.push({ tag: intent.sport === "cricket" ? "#Cricket" : "#Football", reason: "Sport" });
  return out.map((c) => ({ ...c, tag: normalizeHashtag(c.tag) })).filter((c) => c.tag.length > 2);
}

export interface CleanContext {
  intent: SportsIntent;
  matchTeamIds: string[];
  platform: string;
}

/**
 * Removes duplicates and case variants, filler, and tags that name a team or player
 * the video is not about. Returns the kept tags in order.
 */
export function cleanHashtags(tags: string[], ctx: CleanContext): string[] {
  const seen = new Set<string>();
  const allowedTeams = new Set([...ctx.intent.teamIds, ...ctx.matchTeamIds]);
  const allowedPlayers = new Set(ctx.intent.playerIds);
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeHashtag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key) || FILLER_HASHTAGS.has(key.slice(1))) continue;
    // #Shorts is a YouTube convention; it never belongs on other platforms.
    if (key === "#shorts" && !ctx.platform.startsWith("youtube")) continue;
    if (ctx.intent.sport) {
      const named = parseSportsIntent(`${tagWords(tag)} ${ctx.intent.sport} match`);
      if (named.teamIds.some((t) => !allowedTeams.has(t)) || named.playerIds.some((p) => !allowedPlayers.has(p))) continue;
    }
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** How many tags an option carries on this platform (editorial default, never above the platform's hard limit). */
export function hashtagCountFor(platform: string): number {
  const r = getPlatform(platform).hashtagRule;
  return Math.min(r.copyDefault, r.hardLimit ?? r.copyDefault);
}

/** Entity tags first (confirmed content), then the model's tags that survive cleaning, capped per platform. */
export function finalTagsFor(modelTags: string[], ctx: CleanContext): string[] {
  const entity = entityHashtags(ctx.intent, ctx.matchTeamIds).map((c) => c.tag);
  return cleanHashtags([...entity, ...modelTags], ctx).slice(0, hashtagCountFor(ctx.platform));
}

/**
 * Final hashtag pass on a whole result: every platform option gets entity tags
 * first plus surviving model tags; suggestions get the same cleaning (with
 * reasons); the older variant/platformVersion fields are re-derived to match.
 */
export function finalizeHashtags(result: CaptionResult, ctx: Omit<CleanContext, "platform"> & { primaryPlatform: string }): CaptionResult {
  const platforms = result.platforms.map((p) => ({
    ...p,
    options: p.options.map((o) => ({ ...o, hashtags: finalTagsFor(o.hashtags, { ...ctx, platform: p.platform }) })),
  }));
  const primary = platforms[0];
  const candidates = entityHashtags(ctx.intent, ctx.matchTeamIds);
  const modelReasons = new Map(result.hashtagSuggestions.map((h) => [h.tag.toLowerCase(), h.reason]));
  const kept = cleanHashtags([...candidates.map((c) => c.tag), ...result.hashtagSuggestions.map((h) => h.tag)], { ...ctx, platform: ctx.primaryPlatform });
  const hashtagSuggestions = kept.slice(0, 8).map((tag) => ({
    tag,
    reason: candidates.find((c) => c.tag.toLowerCase() === tag.toLowerCase())?.reason ?? modelReasons.get(tag.toLowerCase()) ?? "Relevant to your video",
  }));
  const variants = primary
    ? result.variants.map((v) => {
        const o = primary.options.find((x) => KIND_TO_VARIANT[x.kind] === v.id);
        return o ? { ...v, hashtags: o.hashtags } : v;
      })
    : result.variants.map((v) => ({ ...v, hashtags: finalTagsFor(v.hashtags, { ...ctx, platform: ctx.primaryPlatform }) }));
  const platformVersions = result.platformVersions.map((pv) => {
    const p = platforms.find((x) => x.platform === pv.platform);
    const rec = p?.options.find((o) => o.kind === p.recommended);
    return { ...pv, hashtags: rec ? rec.hashtags : finalTagsFor(pv.hashtags, { ...ctx, platform: pv.platform }) };
  });
  return { ...result, platforms, hashtagSuggestions, variants, platformVersions };
}
