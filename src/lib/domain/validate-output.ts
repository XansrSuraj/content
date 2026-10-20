import type { CaptionResult, ResultOption } from "./captions";
import { adapterFor, wordingLabel } from "./platform-adapters";
import { FILLER_HASHTAGS } from "./hashtag-builder";
import { parseSportsIntent, type SportsIntent } from "./sports/intent";
import type { MatchStage } from "./sports/resolve";

export type IssueCode =
  | "extra_entity"
  | "result_claim"
  | "timing_claim"
  | "unsupported_number"
  | "language_mix"
  | "missing_field"
  | "too_long"
  | "platform_wording"
  | "banned_claim"
  | "hashtag_issue"
  | "duplicate_option";

export interface ValidationIssue {
  code: IssueCode;
  platform: string;
  kind: ResultOption["kind"];
  field: "title" | "description" | "caption" | "hashtags";
  detail: string;
  /** The offending sentence, when one can be pointed at (used by the safe fallback). */
  sentence: string | null;
}

export interface ValidationContext {
  /** Everything the creator wrote in this conversation. */
  sourceText: string;
  /** Evidence lines given to the model (match facts, references…). */
  evidenceText: string;
  intent: SportsIntent;
  matchTeamIds: string[];
  /** Stage the caption is written for (posting time); null = no match attached. */
  stage: MatchStage | null;
  /** A verified result exists (completed, live-status provider). */
  resultVerified: boolean;
  /** The post goes out after kick-off: "will start / kal hoga" phrasing would be wrong when it is read. */
  postAfterStart?: boolean;
  language: "hinglish" | "hindi" | "english";
}

const RESULT_CLAIM =
  /\b(won|wins|win kar (liya|liye)|beat|beats|defeated|thrashed|lost to|clinched|jeet gaye|jeet gayi|jeet liya|jeeta|jeete|haar gaye|haar gayi|hara diya|haraya|by \d+ (runs?|wickets?)|\d+\s*[-–]\s*\d+ (se|win|victory|jeet))\b|जीत गए|जीत गई|हरा दिया|हार गए/i;
const SCORE_LIKE = /\b\d{1,3}\s*[/-]\s*\d{1,2}\b|\b\d+\s*[-–]\s*\d+\b/;
const LIVE_CLAIM = /\b(live now|abhi live|chal raha hai match|match chal raha|ongoing|happening now|right now on the field|aaj ka match)\b|अभी लाइव|आज का मैच/i;
const BANNED: [RegExp, string][] = [
  [/\b(giveaway|give away|free gift|win (a|an|free)|lucky winner|contest alert)\b|गिवअवे/i, "giveaway"],
  [/\b(shout ?out|follow for follow|follow back|f4f)\b|शाउटआउट/i, "shoutout / follow-back"],
  [/\b(inside (source|info|news)|sources (say|claim)|exclusive (news|info|leak)|leaked|insider)\b/i, "insider access"],
  [/\b(guaranteed|100% viral|viral (pakka|guaranteed)|will go viral|viral ho jayega|algorithm (hack|boost))\b|वायरल पक्का/i, "virality promise"],
];
/** Facts no connected source can confirm: allowed only when the creator's own text says it. */
const UNVERIFIABLE_FACT =
  /\b(injur\w*|ruled out|out of the (series|match|tournament)|playing (xi|11)|line-?up|transfer\w*|signs for|signed for|joins|banned|suspended|retire\w*|record|world record|milestone)\b|चोट|ट्रांसफर|रिकॉर्ड/i;

/** First-person experiences the creator did not describe (checked against their own text). */
const EXPERIENCE: RegExp[] = [/\b(i was at the stadium|stadium mein (tha|thi|the)|maine (unse|use|virat|dhoni|rohit) mil|i met (him|her|virat|dhoni|rohit)|backstage|dressing room mein)\b/i];

const FUTURE_START = /\b(will start|starts at|starting at|kicks off at|start hoga|shuru hoga|hone wala hai|hone wali hai|kal hoga|aaj hoga|kal khelenge|kal khela jayega)\b|शुरू होगा|कल होगा|आज होगा|खेला जाएगा/i;

const DEVA = /[ऀ-ॿ]/;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const optionMain = (o: ResultOption) => o.caption || o.description || o.title;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Numbers that need a source: 2+ digits, or any number with a sports/stat unit. */
function checkedNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b\d[\d,.]*\b(\s*(runs?|wickets?|wkts?|goals?|overs?|points?|%|x|k|lakh|crore|balls?|sixes|fours))?/gi)) {
    const digits = m[0].replace(/[^\d]/g, "");
    if (digits.length >= 2 || m[1]) out.push(digits);
  }
  return out;
}

function optionFields(platform: string, o: ResultOption): { field: "title" | "description" | "caption"; text: string }[] {
  const a = adapterFor(platform);
  return a.fields.map((f) => ({ field: f, text: o[f] ?? "" }));
}

/** Deterministic checks for one result. Empty list = valid. */
export function validateResult(result: CaptionResult, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceDigits = new Set([...checkedNumbers(`${ctx.sourceText}\n${ctx.evidenceText}`), ...((`${ctx.sourceText}\n${ctx.evidenceText}`.match(/\d+/g) ?? []) as string[])]);
  const allowedTeams = new Set([...ctx.intent.teamIds, ...ctx.matchTeamIds]);
  const allowedPlayers = new Set(ctx.intent.playerIds);
  const sourceHasDeva = DEVA.test(ctx.sourceText);
  const resultAllowed = ctx.resultVerified || (ctx.stage === null && RESULT_CLAIM.test(ctx.sourceText));

  for (const p of result.platforms) {
    const adapter = adapterFor(p.platform);
    for (const o of p.options) {
      const push = (code: IssueCode, field: ValidationIssue["field"], detail: string, sentence: string | null = null) =>
        issues.push({ code, platform: p.platform, kind: o.kind, field, detail, sentence });

      for (const { field, text } of optionFields(p.platform, o)) {
        if (!text.trim()) {
          push("missing_field", field, `${field} is empty`);
          continue;
        }
        const limit = adapter.limits[field];
        if (limit && limit.status === "official" && text.length > limit.max) push("too_long", field, `${field} is ${text.length} characters (limit ${limit.max})`);
        for (const re of adapter.forbiddenWording) if (re.test(text)) push("platform_wording", field, `uses "${wordingLabel(re)}", which belongs to another platform`);

        for (const s of sentences(text)) {
          if (ctx.intent.sport) {
            const named = parseSportsIntent(`${s} ${ctx.intent.sport} match`);
            const extraTeam = named.teamIds.find((t) => !allowedTeams.has(t));
            const extraPlayer = named.playerIds.find((pl) => !allowedPlayers.has(pl));
            if (extraTeam || extraPlayer) push("extra_entity", field, `names ${extraTeam ?? extraPlayer}, which is not in the video`, s);
          }
          // A question ("who wins this one?", "kaun jeetega?") is not a result claim.
          // Only "who/which … win?" questions without a score ("Arsenal vs Everton: who wins?") are exempt;
          // "2-1 se haraya, kya match tha?" still states a result.
          const question = /\?\s*$/.test(s) && /\b(who|which|kaun|kis)\b|कौन/i.test(s) && !SCORE_LIKE.test(s) && !/\b(won|beat|haraya|hara diya|jeet gaye)\b/i.test(s);
          if (!resultAllowed && !question && (RESULT_CLAIM.test(s) || (ctx.intent.sport && SCORE_LIKE.test(s) && !SCORE_LIKE.test(ctx.sourceText)))) {
            push("result_claim", field, "states a result or score that is not verified", s);
          }
          if ((ctx.stage === "unknown" || ctx.stage === "upcoming") && LIVE_CLAIM.test(s) && !LIVE_CLAIM.test(ctx.sourceText)) {
            push("timing_claim", field, "claims the match is live/today without a verified status", s);
          }
          if (ctx.postAfterStart && FUTURE_START.test(s)) push("timing_claim", field, "says the match is still to start, but the post goes out after kick-off", s);
          const unsupported = checkedNumbers(s).filter((n) => !sourceDigits.has(n));
          if (unsupported.length) push("unsupported_number", field, `number ${unsupported[0]} is not in your caption or the evidence`, s);
          for (const [re, what] of BANNED) if (re.test(s)) push("banned_claim", field, `contains a ${what}`, s);
          if (UNVERIFIABLE_FACT.test(s) && !UNVERIFIABLE_FACT.test(ctx.sourceText) && !UNVERIFIABLE_FACT.test(ctx.evidenceText)) {
            push("banned_claim", field, "states an injury/lineup/transfer/record that is not in your caption or the evidence", s);
          }
          for (const re of EXPERIENCE) if (re.test(s) && !re.test(ctx.sourceText)) push("banned_claim", field, "invents a first-person experience", s);
          if (ctx.language === "hinglish" && DEVA.test(s) && !sourceHasDeva) push("language_mix", field, "Devanagari in a Hinglish output", s);
          if (ctx.language === "hindi" && !DEVA.test(s) && (s.match(/[A-Za-z]{2,}/g) ?? []).length >= 5) push("language_mix", field, "an English sentence in a Hindi output", s);
        }
      }
      const own = norm(optionMain(o));
      if (own && p.options.some((x) => x !== o && x.kind < o.kind && norm(optionMain(x)) === own)) {
        push("duplicate_option", adapter.fields.includes("caption") ? "caption" : "description", "is identical to another option — each option needs a different approach");
      }
      const lower = o.hashtags.map((t) => t.toLowerCase());
      if (new Set(lower).size !== lower.length) push("hashtag_issue", "hashtags", "duplicate hashtags");
      const filler = lower.find((t) => FILLER_HASHTAGS.has(t.slice(1)));
      if (filler) push("hashtag_issue", "hashtags", `filler hashtag ${filler}`);
    }
  }
  return issues;
}

/** Short, model-readable list of what to fix (for the targeted repair request). */
export function repairInstructions(issues: ValidationIssue[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const i of issues) {
    const line = `${i.platform} / ${i.kind} / ${i.field}: ${i.detail}${i.sentence ? ` — in: "${i.sentence.slice(0, 160)}"` : ""}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.slice(0, 12);
}

/** Neutral swaps for another platform's words; sentences that still break the rule are dropped. */
const SWAPS: Record<string, [RegExp, string][]> = {
  youtube: [
    [/\breels?\b/gi, "video"],
    [/\bswipe up\b/gi, "watch"],
  ],
  instagram: [
    [/\bsubscribe\b/gi, "follow"],
    [/\bshorts\b/gi, "reels"],
  ],
  facebook: [
    [/\bsubscribe\b/gi, "follow"],
    [/\bshorts\b/gi, "videos"],
  ],
  tiktok: [
    [/\breels?\b/gi, "video"],
    [/\bsubscribe\b/gi, "follow"],
    [/\bshorts\b/gi, "videos"],
  ],
};

function toPlatformWording(platform: string, text: string): string {
  const family = platform.split("_")[0];
  let out = text;
  for (const [re, to] of SWAPS[family] ?? []) out = out.replace(re, to);
  // Facebook posts (not Reels) and Instagram posts must not talk about Reels either.
  if (platform === "facebook_post" || platform === "instagram_post") out = out.replace(/\breels?\b/gi, "post");
  const forbidden = adapterFor(platform).forbiddenWording;
  return sentences(out)
    .filter((s) => !forbidden.some((re) => re.test(s)))
    .join(" ")
    .trim();
}

const SENTENCE_CODES: IssueCode[] = ["extra_entity", "result_claim", "timing_claim", "unsupported_number", "banned_claim", "language_mix"];

/**
 * Conservative fallback: removes every sentence that failed a fact/claim check,
 * drops filler/duplicate tags, trims over-long fields, and says so. Never adds facts.
 */
export function safeResult(result: CaptionResult, issues: ValidationIssue[], fallbackText: string): CaptionResult {
  const bad = new Set(issues.filter((i) => SENTENCE_CODES.includes(i.code) && i.sentence).map((i) => `${i.platform}|${i.kind}|${i.field}|${i.sentence}`));
  const fix = (platform: string, kind: ResultOption["kind"], field: "title" | "description" | "caption", text: string) => {
    if (!text) return text;
    const kept = sentences(text).filter((s) => !bad.has(`${platform}|${kind}|${field}|${s}`));
    let out = toPlatformWording(platform, kept.join(" ").trim());
    const limit = adapterFor(platform).limits[field];
    if (limit && out.length > limit.max) out = out.slice(0, limit.max - 1).trimEnd() + "…";
    return out;
  };
  const platforms = result.platforms.map((p) => ({
    ...p,
    options: p.options.map((o) => {
      const fields = adapterFor(p.platform).fields;
      const next = { ...o };
      for (const f of fields) next[f] = fix(p.platform, o.kind, f, o[f]);
      // Never leave a required field empty: fall back to the creator's own words.
      for (const f of fields) {
        if (next[f].trim()) continue;
        const own = toPlatformWording(p.platform, fallbackText) || fallbackText;
        next[f] = f === "title" ? own.split(/\r?\n/)[0].slice(0, 100) : own.slice(0, 2000);
      }
      const seen = new Set<string>();
      next.hashtags = o.hashtags.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k) || FILLER_HASHTAGS.has(k.slice(1))) return false;
        seen.add(k);
        return true;
      });
      return next;
    }),
  }));
  return {
    ...result,
    platforms,
    limitations: [...result.limitations, "Some lines were removed because they stated things that could not be verified (results, numbers, names or claims). Check before posting."].slice(0, 6),
  };
}
