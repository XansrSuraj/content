import { z } from "zod";
import { PLATFORM_IDS, getPlatform } from "./platforms";
import { GOAL_IDS, LANGUAGE_IDS, LENGTH_IDS, REGION_IDS, TONE_IDS } from "./options";
import { normalizeHashtag } from "./hashtags";

// ---------- Editable context ----------

export const CaptionContextSchema = z.object({
  platform: z.enum(PLATFORM_IDS).default("instagram_reels"),
  language: z.enum(LANGUAGE_IDS).default("hinglish"),
  tone: z.enum(TONE_IDS).default("conversational"),
  audience: z.string().trim().max(200).default(""),
  region: z.enum(REGION_IDS).default("IN"),
  goal: z.enum(GOAL_IDS).default("engagement"),
  length: z.enum(LENGTH_IDS).default("medium"),
  preserveTerms: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  emoji: z.enum(["auto", "none", "light"]).default("auto"),
  /** When set, every variant must start with exactly this line. */
  keepFirstLine: z.string().max(300).nullable().default(null),
  outputMode: z.enum(["full", "final_only"]).default("full"),
  /** Sticky creator instructions gathered from follow-ups, e.g. "less promotional". */
  notes: z.array(z.string().max(120)).max(8).default([]),
  /** Give matching current search-interest observations to the model as context. */
  useTrends: z.boolean().default(true),
  /** The fixture the creator confirmed this caption is about (overrides automatic matching). */
  matchId: z.string().max(64).nullable().default(null),
  /** When the creator will post (ISO); null = now. Changes how match timing is written. */
  publishAt: z.string().datetime({ offset: true }).nullable().default(null),
  /** Extra platforms to adapt the recommended option for, in the same request. */
  extraPlatforms: z.array(z.enum(PLATFORM_IDS)).max(2).default([]),
  /** Optional details from "More details"; kept for every follow-up in the conversation. */
  details: z
    .object({
      videoDescription: z.string().trim().max(200).default(""),
      transcript: z.string().trim().max(4000).default(""),
      preferredTeam: z.string().trim().max(80).default(""),
      reference: z.string().trim().max(300).default(""),
    })
    .default({ videoDescription: "", transcript: "", preferredTeam: "", reference: "" }),
  /** Answers to "which MI / which Ronaldo?": alias → chosen entity id. */
  aliasChoices: z.record(z.string().max(30), z.string().max(60)).default({}),
  /** Creator corrections from the interpretation chip ("not sports", "this is a recap"…). */
  sportOverride: z.enum(["cricket", "football", "none"]).nullable().default(null),
  intentOverride: z
    .enum(["preview", "prediction", "analysis", "reaction", "recap", "historical_highlight", "meme", "fan_opinion"])
    .nullable()
    .default(null),
});
export type CaptionContext = z.infer<typeof CaptionContextSchema>;

export const DEFAULT_CONTEXT: CaptionContext = CaptionContextSchema.parse({});

// ---------- Model output (what we ask the model for) ----------

/**
 * Kept free of numeric/length constraints so it maps cleanly onto structured
 * output JSON schema. Business rules are enforced afterwards by CaptionResultSchema.
 * Note: there is deliberately no "trending" field. Trend status is assigned by
 * the application from stored evidence, never by the model.
 */
export const OPTION_KINDS = ["original_improved", "search_focused", "conversation_focused"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

const ModelOption = z.object({
  kind: z.enum(OPTION_KINDS).describe("original_improved keeps the creator's meaning and voice; search_focused uses natural terms people search; conversation_focused invites a meaningful reply."),
  title: z.string().describe("YouTube title (only for YouTube platforms), else empty string."),
  description: z.string().describe("YouTube description (only for YouTube platforms), else empty string."),
  caption: z.string().describe("Caption text without hashtags (Instagram/Facebook/TikTok), else empty string."),
  hashtags: z.array(z.string()).describe("Hashtags for this option, each starting with #, within the platform limit."),
  why: z.string().describe("One short, specific sentence on why this option fits."),
});

export const CaptionModelOutputSchema = z.object({
  topicSummary: z.string().describe("One or two sentences restating the creator's actual topic and intent."),
  assumptions: z.array(z.string()).describe("Assumptions made because context was missing. Empty if none."),
  clarifyingQuestion: z
    .string()
    .nullable()
    .describe("At most one focused question if essential information is missing, else null."),
  platforms: z
    .array(
      z.object({
        platform: z.string().describe("Platform id from <context>: the primary platform first, then each alsoFor platform."),
        recommended: z.enum(OPTION_KINDS),
        options: z.array(ModelOption).describe("Exactly three options, one of each kind."),
      }),
    )
    .describe("One entry per platform in <context> (primary first)."),
  hooks: z.array(z.string()).describe("3 to 5 alternative opening lines."),
  hashtagSuggestions: z
    .array(z.object({ tag: z.string(), reason: z.string() }))
    .describe("A small set of topic-relevant hashtags with a short relevance reason each."),
  keywords: z.array(z.string()).describe("Natural search phrases a viewer might type. Empty if not useful."),
  improvements: z.array(z.string()).describe("Concise list of what was improved and why."),
  limitations: z.array(z.string()).describe("Important caveats, e.g. facts that need checking. Empty if none."),
});
// ---------- Validated result stored and rendered ----------

const tagSchema = z
  .string()
  .transform((t) => normalizeHashtag(t))
  .pipe(z.string().min(2).max(60));

const ResultOption = z.object({
  kind: z.enum(OPTION_KINDS),
  title: z.string().max(300).default(""),
  description: z.string().max(5000).default(""),
  caption: z.string().max(5000).default(""),
  hashtags: z.array(tagSchema).max(12).default([]),
  why: z.string().max(400).default(""),
});
export type ResultOption = z.infer<typeof ResultOption>;

const ResultPlatform = z.object({
  platform: z.string().max(40),
  recommended: z.enum(OPTION_KINDS),
  options: z.array(ResultOption).length(3),
});
export type ResultPlatform = z.infer<typeof ResultPlatform>;

export const KIND_TO_VARIANT: Record<OptionKind, "A" | "B" | "C"> = { original_improved: "A", search_focused: "B", conversation_focused: "C" };
export const KIND_LABEL: Record<OptionKind, string> = {
  original_improved: "Original improved",
  search_focused: "Search focused",
  conversation_focused: "Conversation focused",
};

/** Main text of an option for the legacy single-caption views (YouTube: the description). */
export function optionText(o: { caption: string; description: string; title: string }): string {
  return (o.caption || o.description || o.title).trim();
}

/**
 * Model output v2 lists platforms with three typed options each. The older
 * fields (variants A/B/C, platformVersions) are derived from it, so history,
 * saving and older views keep working; results stored before v2 parse as before.
 */
function fromV2(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const r = input as Record<string, unknown>;
  if (!Array.isArray(r.platforms) || r.platforms.length === 0 || Array.isArray(r.variants)) return input;
  type P = { platform: string; recommended: OptionKind; options: { kind: OptionKind; title?: string; description?: string; caption?: string; hashtags?: string[]; why?: string }[] };
  const platforms = r.platforms as P[];
  const primary = platforms[0];
  const ordered = OPTION_KINDS.map((k) => primary.options?.find((o) => o.kind === k)).filter(Boolean) as P["options"];
  const variants = ordered.map((o) => ({
    id: KIND_TO_VARIANT[o.kind],
    approach: KIND_LABEL[o.kind],
    caption: optionText({ caption: o.caption ?? "", description: o.description ?? "", title: o.title ?? "" }) || (o.title ?? ""),
    hashtags: o.hashtags ?? [],
  }));
  const rec = primary.options?.find((o) => o.kind === primary.recommended);
  return {
    ...r,
    variants,
    recommendedVariantId: KIND_TO_VARIANT[primary.recommended] ?? "A",
    recommendationReason: rec?.why ?? "",
    platformVersions: platforms.slice(1).map((p) => {
      const o = p.options?.find((x) => x.kind === p.recommended) ?? p.options?.[0];
      return { platform: p.platform, caption: optionText({ caption: o?.caption ?? "", description: o?.description ?? "", title: o?.title ?? "" }) || "-", hashtags: o?.hashtags ?? [] };
    }),
  };
}

/** Re-derives variants/platformVersions from v2 platforms after options were edited (e.g. by the safe pass). */
export function syncLegacyFields(r: CaptionResult): CaptionResult {
  const primary = r.platforms[0];
  if (!primary) return r;
  const variants = r.variants.map((v) => {
    const o = primary.options.find((x) => KIND_TO_VARIANT[x.kind] === v.id);
    return o ? { ...v, caption: optionText(o) || v.caption, hashtags: o.hashtags } : v;
  });
  const platformVersions = r.platformVersions.map((pv) => {
    const p = r.platforms.find((x) => x.platform === pv.platform);
    const o = p?.options.find((x) => x.kind === p.recommended);
    return o ? { ...pv, caption: optionText(o) || pv.caption, hashtags: o.hashtags } : pv;
  });
  return { ...r, variants, platformVersions };
}

const CaptionResultBase = z.object({
  topicSummary: z.string().min(1).max(600),
  assumptions: z.array(z.string().max(300)).max(6),
  clarifyingQuestion: z.string().max(300).nullable(),
  variants: z
    .array(
      z.object({
        id: z.enum(["A", "B", "C"]),
        approach: z.string().min(1).max(80),
        caption: z.string().min(1).max(2200),
        hashtags: z.array(tagSchema).max(12),
      }),
    )
    .length(3),
  recommendedVariantId: z.enum(["A", "B", "C"]),
  recommendationReason: z.string().max(500),
  hooks: z.array(z.string().max(200)).max(6),
  hashtagSuggestions: z.array(z.object({ tag: tagSchema, reason: z.string().max(200) })).max(12),
  keywords: z.array(z.string().max(80)).max(10),
  improvements: z.array(z.string().max(300)).max(8),
  limitations: z.array(z.string().max(300)).max(6),
  /** Older stored results have none. */
  platformVersions: z
    .array(z.object({ platform: z.string().max(40), caption: z.string().min(1).max(2200), hashtags: z.array(tagSchema).max(12) }))
    .max(3)
    .default([]),
  /** v2: per selected platform, three typed options. Empty for results made before v2. */
  platforms: z.array(ResultPlatform).max(3).default([]),
});
export const CaptionResultSchema = z.preprocess(fromV2, CaptionResultBase);
export type CaptionResult = z.infer<typeof CaptionResultBase>;

/**
 * What providers validate model replies with: the v2 shape is checked first, so any
 * error is reported in the terms the model was asked for (platforms × 3 options of
 * different kinds), then the reply is converted into the stored result.
 */
/**
 * Small models often omit fields that should be empty (no `title` on an Instagram option,
 * no `hashtagSuggestions`). Those are filled with empty defaults here; real structural
 * problems (wrong option count, empty text) still fail and get repaired.
 */
function fillModelDefaults(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const r = { ...(input as Record<string, unknown>) };
  for (const k of ["assumptions", "hooks", "hashtagSuggestions", "keywords", "improvements", "limitations"]) if (!Array.isArray(r[k])) r[k] = [];
  if (r.clarifyingQuestion === undefined) r.clarifyingQuestion = null;
  if (typeof r.topicSummary !== "string") r.topicSummary = "";
  if (!Array.isArray(r.platforms)) r.platforms = [];
  r.platforms = (r.platforms as Record<string, unknown>[]).map((p) => {
    const options = Array.isArray(p?.options)
      ? (p.options as Record<string, unknown>[]).map((o, i) => ({
          title: "",
          description: "",
          caption: "",
          why: "",
          ...o,
          kind: normalizeKind(o?.kind) ?? OPTION_KINDS[i] ?? o?.kind,
          hashtags: Array.isArray(o?.hashtags) ? o.hashtags : [],
        }))
      : [];
    // Which option is recommended is a choice, not a fact: an unreadable value falls back to the first option.
    const recommended = normalizeKind(p?.recommended) ?? (options[0]?.kind as OptionKind | undefined) ?? "original_improved";
    return { ...p, options, recommended };
  });
  return r;
}

/** "Original improved", "original-improved", "A" → "original_improved". */
function normalizeKind(v: unknown): OptionKind | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((OPTION_KINDS as readonly string[]).includes(k)) return k as OptionKind;
  const byLetter: Record<string, OptionKind> = { a: "original_improved", b: "search_focused", c: "conversation_focused" };
  if (byLetter[k]) return byLetter[k];
  return OPTION_KINDS.find((x) => k.startsWith(x.split("_")[0])) ?? null;
}

/** A complete reply in the older shape (exactly 3 variants) is accepted rather than wasted. */
function isCompleteV1(input: unknown): boolean {
  const r = input as { platforms?: unknown[]; variants?: unknown[] } | null;
  return Boolean(r && (!r.platforms || r.platforms.length === 0) && Array.isArray(r.variants) && r.variants.length === 3);
}

const CaptionFromModelV2 = z.preprocess(fillModelDefaults, CaptionModelOutputSchema).superRefine((v, ctx) => {
  if (v.platforms.length === 0) ctx.addIssue({ code: "custom", path: ["platforms"], message: "Must contain one entry per platform listed in <context>.platforms" });
  v.platforms.forEach((p, i) => {
    const kinds = p.options.map((o) => o.kind);
    if (p.options.length !== 3 || new Set(kinds).size !== 3) {
      ctx.addIssue({ code: "custom", path: ["platforms", i, "options"], message: "Must be exactly 3 options: original_improved, search_focused, conversation_focused (one each)" });
    }
    p.options.forEach((o, j) => {
      if (!(o.caption || o.description || o.title).trim()) ctx.addIssue({ code: "custom", path: ["platforms", i, "options", j], message: "Option text is empty" });
    });
  });
}).transform((v, ctx) => {
  const r = CaptionResultSchema.safeParse(v);
  if (r.success) return r.data;
  for (const i of r.error.issues) ctx.addIssue({ code: "custom", path: i.path as (string | number)[], message: i.message });
  return z.NEVER;
});

export const CaptionFromModelSchema = z.unknown().transform((input, ctx) => {
  const parsed = isCompleteV1(input) ? CaptionResultSchema.safeParse(input) : CaptionFromModelV2.safeParse(input);
  if (parsed.success) return parsed.data as CaptionResult;
  for (const i of parsed.error.issues) ctx.addIssue({ code: "custom", path: i.path as (string | number)[], message: i.message });
  return z.NEVER;
});

export type GenerationMode = "live_ai" | "open_model" | "local_ai" | "template_preview" | "example";

// ---------- Follow-up constraint extraction ----------

export interface ContextUpdate {
  context: CaptionContext;
  applied: string[];
}

/**
 * Deterministically picks up common Hinglish/English follow-up instructions so
 * they persist across turns and are visible as chips — the model also sees the
 * raw message, this just makes the important ones sticky and enforceable.
 */
export function applyFollowUpToContext(message: string, ctx: CaptionContext, originalCaption: string): ContextUpdate {
  const m = message.toLowerCase();
  const next: CaptionContext = { ...ctx, notes: [...ctx.notes], preserveTerms: [...ctx.preserveTerms] };
  const applied: string[] = [];

  if (/emoji\s*(hata|remove|mat|nahi|no\b|band)|(no|remove|without) emoji|इमोजी\s*(हटा|नहीं|मत|बंद)/.test(m)) {
    next.emoji = "none";
    applied.push("Emoji off");
  }
  if (/\b(short|chhota|chota|chhoti|chhote|shorter|concise)\b|छोट[ाीे]/.test(m)) {
    next.length = "short";
    applied.push("Length: short");
  } else if ((/\b(lamba|longer|long|detail)\b/.test(m) || /लंब[ाीे]/.test(m)) && !/\blong video\b/.test(m)) {
    next.length = "long";
    applied.push("Length: long");
  }
  if (/\b(funny|mazedaar|comedy|hasao)\b|मज़?ेदार|फ़?नी/.test(m)) {
    next.tone = "funny";
    applied.push("Tone: funny");
  } else if (/\b(emotional|dil se)\b|भावुक|दिल से/.test(m)) {
    next.tone = "emotional";
    applied.push("Tone: emotional");
  } else if (/\bprofessional\b/.test(m)) {
    next.tone = "professional";
    applied.push("Tone: professional");
  } else if (/\b(educational|samjhao|explain)\b/.test(m)) {
    next.tone = "educational";
    applied.push("Tone: educational");
  } else if (/\b(energetic|josh)\b/.test(m)) {
    next.tone = "energetic";
    applied.push("Tone: energetic");
  }
  if (/\b(natural|naturally|swabhavik)\b.*\bhinglish\b|\bhinglish\b.*\bnatural\b|हिंग्लिश.*स्वाभाविक/.test(m)) {
    addNote(next, "Make the Hinglish sound more natural, like creators actually write");
    applied.push("More natural Hinglish");
  }
  const focus = message.match(/\bfocus on ([\p{L}][\p{L} .'-]{1,40}?)[.!]?$/iu) ?? message.match(/^([\p{L}][\p{L} .'-]{1,40}?) (?:pe|par|पर) (?:focus|फोकस)/iu);
  if (focus) {
    addNote(next, `Focus on ${focus[1].trim()} (only facts already in the caption or evidence)`);
    applied.push(`Focus: ${focus[1].trim()}`);
  }
  if (/\bhinglish\b|हिंग्लिश/.test(m)) {
    next.language = "hinglish";
    applied.push("Language: Hinglish");
  } else if ((/\b(hindi|devanagari)\b/.test(m) || /हि[ंन्]दी में/.test(m)) && !/hinglish/.test(m)) {
    next.language = "hindi";
    applied.push("Language: Hindi");
  } else if (/\b(in english|english mein|english me)\b/.test(m)) {
    next.language = "english";
    applied.push("Language: English");
  }
  if (/(youtube\s*)?shorts/.test(m)) {
    next.platform = "youtube_shorts";
    applied.push("Platform: YouTube Shorts");
  } else if (/\byoutube\b/.test(m)) {
    next.platform = "youtube";
    applied.push("Platform: YouTube");
  } else if (/\b(insta|instagram|reels?)\b/.test(m) && !/facebook/.test(m)) {
    next.platform = "instagram_reels";
    applied.push("Platform: Instagram Reels");
  } else if (/\bfacebook\b|\bfb\b/.test(m)) {
    next.platform = "facebook_reels";
    applied.push("Platform: Facebook Reels");
  } else if (/\btiktok\b/.test(m)) {
    next.platform = "tiktok";
    applied.push("Platform: TikTok");
  }
  if (/(first line|pehli line|pahli line|starting line).*(same|wahi|mat badlo|keep|rakho)|keep (my |the )?first line|पहली लाइन.*(वही|same|मत बदलो|रखो)/.test(m)) {
    const first = originalCaption.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
    if (first) {
      next.keepFirstLine = first.slice(0, 300);
      applied.push("First line locked");
    }
  }
  if (/(promotional|promo|salesy|bechne).*(kam|less|mat|nahi)|less promotional|kam promotional|प्रमोशन\S*\s*कम/.test(m)) {
    addNote(next, "Keep it less promotional");
    applied.push("Less promotional");
  }
  if (/sirf.*(final|caption).*(hashtag)|only.*final.*caption|just the caption|सिर्फ़?.*कैप्शन/.test(m)) {
    next.outputMode = "final_only";
    applied.push("Final caption + hashtags only");
  }
  return { context: next, applied };
}

function addNote(ctx: CaptionContext, note: string) {
  if (!ctx.notes.includes(note)) ctx.notes = [...ctx.notes, note].slice(-8);
}

// ---------- Deterministic post-processing ----------

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

/**
 * Enforces constraints the creator explicitly set, so they hold even if the
 * model drifts: emoji removal, locked first line, preserved terms check.
 * Returns the adjusted result plus notes that are surfaced as limitations.
 */
/** Hashtags belong in the hashtag list; a trailing run inside the caption would be copied twice. */
export function stripTrailingHashtags(caption: string): string {
  return caption.replace(/(?:\s*#[\p{L}\p{M}\p{N}_]+)+\s*$/u, "").trim() || caption.trim();
}

/**
 * Makes `locked` the first line, keeping whatever the model wrote after it.
 * Handles the model repeating the locked sentence (with or without emoji) at
 * the start of a longer first line.
 */
export function applyLockedFirstLine(caption: string, locked: string, emoji: CaptionContext["emoji"]): string {
  const lockedOut = emoji === "none" ? stripEmoji(locked) : locked.trim();
  const lines = caption.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim());
  if (idx < 0) return lockedOut;
  const first = lines[idx].trim();
  const bare = (s: string) => stripEmoji(s).replace(/\s+/g, " ").trim();
  let remainder = first;
  if (first.startsWith(locked.trim())) remainder = first.slice(locked.trim().length);
  else if (bare(first).startsWith(bare(locked))) remainder = bare(first).slice(bare(locked).length);
  const body = [remainder.trim(), ...lines.slice(idx + 1)].join("\n").trim();
  return body ? `${lockedOut}\n${body}` : lockedOut;
}

/** Engagement bait and invented stats the rules forbid. Small models still produce them sometimes. */
const BAIT = [
  /\b(comment|like|share|follow|subscribe|save)\s+(karo|kar\s*do|kijiye|karna|karein)\s*(,\s*)?(warna|varna|nahi\s*to|nahin\s*to)\b/i,
  /\b(warna|varna)\s+(bad\s*luck|kuch\s*bura|7\s*saal)/i,
  /\b(type|likho)\s+["“']?(yes|haan|amen|1)["”']?\s+(in|mein|me)\s+(the\s+)?comments?\b/i,
  /\b\d{2,3}\s*%\s*(log|logon|people|of people)\b/i,
];

export function removeEngagementBait(caption: string): { text: string; removed: boolean } {
  const bad = caption.split(/(?<=[.!?।…])\s+|\n/).filter((p) => BAIT.some((re) => re.test(p)));
  if (!bad.length) return { text: caption, removed: false };
  let text = caption;
  for (const b of bad) text = text.replace(b, "");
  text = text.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: text || caption, removed: Boolean(text) };
}

export function enforceConstraints(result: CaptionResult, ctx: CaptionContext): CaptionResult {
  const limitations = [...result.limitations];
  const baitIn: string[] = [];
  let variants = result.variants.map((v) => {
    const cleaned = removeEngagementBait(stripTrailingHashtags(v.caption));
    if (cleaned.removed) baitIn.push(v.id);
    return { ...v, caption: cleaned.text };
  });
  if (baitIn.length) limitations.push(`Removed engagement bait from option ${baitIn.join(", ")}.`);

  if (ctx.keepFirstLine) {
    const locked = ctx.keepFirstLine.trim();
    variants = variants.map((v) => ({ ...v, caption: applyLockedFirstLine(v.caption, locked, ctx.emoji) }));
  }
  // Emoji removal runs last so nothing (including a locked line) can reintroduce emoji.
  if (ctx.emoji === "none") {
    variants = variants.map((v) => ({ ...v, caption: stripEmoji(v.caption) }));
  }
  for (const term of ctx.preserveTerms) {
    const missing = variants.filter((v) => !v.caption.toLowerCase().includes(term.toLowerCase()));
    if (missing.length) {
      limitations.push(
        `"${term}" is missing from option ${missing.map((v) => v.id).join(", ")}. Add it back before posting if it matters.`,
      );
    }
  }
  // Only platforms the creator asked for, once each, with their own hashtag limit.
  const seen = new Set<string>();
  const platformVersions = result.platformVersions
    .filter((p) => ctx.extraPlatforms.includes(p.platform as CaptionContext["platform"]) && p.platform !== ctx.platform && !seen.has(p.platform) && seen.add(p.platform))
    .map((p) => {
      const limit = getPlatform(p.platform).hashtagRule.hardLimit;
      const caption = removeEngagementBait(stripTrailingHashtags(p.caption)).text;
      return { ...p, caption: ctx.emoji === "none" ? stripEmoji(caption) : caption, hashtags: limit === null ? p.hashtags : p.hashtags.slice(0, limit) };
    });
  // v2 platforms: only the requested ones (primary first), each option cleaned like the variants.
  const wanted = [ctx.platform, ...ctx.extraPlatforms.filter((p) => p !== ctx.platform)];
  const clean = (text: string, lockFirst: boolean) => {
    let t = removeEngagementBait(stripTrailingHashtags(text)).text;
    if (lockFirst && ctx.keepFirstLine && t) t = applyLockedFirstLine(t, ctx.keepFirstLine.trim(), ctx.emoji);
    return ctx.emoji === "none" ? stripEmoji(t) : t;
  };
  const platforms = wanted
    .map((id) => result.platforms.find((p) => p.platform === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const limit = getPlatform(p.platform).hashtagRule.hardLimit;
      return {
        ...p,
        options: p.options.map((o) => ({
          ...o,
          title: ctx.emoji === "none" ? stripEmoji(o.title) : o.title.trim(),
          caption: o.caption ? clean(o.caption, true) : "",
          description: o.description ? clean(o.description, !o.caption) : "",
          hashtags: limit === null ? o.hashtags : o.hashtags.slice(0, limit),
        })),
      };
    });
  return {
    ...result,
    variants,
    platformVersions,
    platforms,
    hooks: ctx.emoji === "none" ? result.hooks.map(stripEmoji) : result.hooks,
    limitations: limitations.slice(0, 6),
  };
}

export function captionWithHashtags(caption: string, hashtags: string[]): string {
  const tags = hashtags.join(" ").trim();
  return tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
}
