import { z } from "zod";
import { PLATFORM_IDS } from "./platforms";
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
export const CaptionModelOutputSchema = z.object({
  topicSummary: z.string().describe("One or two sentences restating the creator's actual topic and intent."),
  assumptions: z.array(z.string()).describe("Assumptions made because context was missing. Empty if none."),
  clarifyingQuestion: z
    .string()
    .nullable()
    .describe("At most one focused question if essential information is missing, else null."),
  variants: z
    .array(
      z.object({
        id: z.enum(["A", "B", "C"]),
        approach: z.string().describe("Short name of the creative approach, e.g. 'Story-first', 'Question hook'."),
        caption: z.string().describe("Full caption text without hashtags."),
        hashtags: z.array(z.string()).describe("Hashtags for this variant, each starting with #."),
      }),
    )
    .describe("Exactly three meaningfully different caption options."),
  recommendedVariantId: z.enum(["A", "B", "C"]),
  recommendationReason: z.string(),
  hooks: z.array(z.string()).describe("3 to 5 alternative opening lines."),
  hashtagSuggestions: z
    .array(z.object({ tag: z.string(), reason: z.string() }))
    .describe("A small set of topic-relevant hashtags with a short relevance reason each."),
  keywords: z.array(z.string()).describe("Natural search phrases a viewer might type. Empty if not useful."),
  improvements: z.array(z.string()).describe("Concise list of what was improved and why."),
  limitations: z.array(z.string()).describe("Important caveats, e.g. facts that need checking. Empty if none."),
});
export type CaptionModelOutput = z.infer<typeof CaptionModelOutputSchema>;

// ---------- Validated result stored and rendered ----------

const tagSchema = z
  .string()
  .transform((t) => normalizeHashtag(t))
  .pipe(z.string().min(2).max(60));

export const CaptionResultSchema = z.object({
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
});
export type CaptionResult = z.infer<typeof CaptionResultSchema>;

export type GenerationMode = "live_ai" | "template_preview" | "example";

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

  if (/emoji\s*(hata|remove|mat|nahi|no\b|band)|no emoji|without emoji/.test(m)) {
    next.emoji = "none";
    applied.push("Emoji off");
  }
  if (/\b(short|chhota|chota|chhoti|chhote|shorter|concise)\b/.test(m)) {
    next.length = "short";
    applied.push("Length: short");
  } else if (/\b(lamba|longer|long|detail)\b/.test(m) && !/\blong video\b/.test(m)) {
    next.length = "long";
    applied.push("Length: long");
  }
  if (/\b(funny|mazedaar|comedy|hasao)\b/.test(m)) {
    next.tone = "funny";
    applied.push("Tone: funny");
  } else if (/\b(emotional|dil se)\b/.test(m)) {
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
  if (/\bhinglish\b/.test(m)) {
    next.language = "hinglish";
    applied.push("Language: Hinglish");
  } else if (/\b(hindi|devanagari)\b/.test(m) && !/hinglish/.test(m)) {
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
  if (/(first line|pehli line|pahli line|starting line).*(same|wahi|mat badlo|keep|rakho)/.test(m)) {
    const first = originalCaption.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
    if (first) {
      next.keepFirstLine = first.slice(0, 300);
      applied.push("First line locked");
    }
  }
  if (/(promotional|promo|salesy|bechne).*(kam|less|mat|nahi)|less promotional|kam promotional/.test(m)) {
    addNote(next, "Keep it less promotional");
    applied.push("Less promotional");
  }
  if (/sirf.*(final|caption).*(hashtag)|only.*final.*caption|just the caption/.test(m)) {
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
export function enforceConstraints(result: CaptionResult, ctx: CaptionContext): CaptionResult {
  const limitations = [...result.limitations];
  let variants = result.variants.map((v) => ({ ...v }));

  if (ctx.emoji === "none") {
    variants = variants.map((v) => ({ ...v, caption: stripEmoji(v.caption) }));
  }
  if (ctx.keepFirstLine) {
    const locked = ctx.keepFirstLine.trim();
    variants = variants.map((v) => {
      const lines = v.caption.split(/\r?\n/);
      const firstIdx = lines.findIndex((l) => l.trim());
      if (firstIdx >= 0 && lines[firstIdx].trim() === locked) return v;
      // Replace the model's opening line with the creator's locked line.
      const rest = firstIdx >= 0 ? lines.slice(firstIdx + 1) : lines;
      return { ...v, caption: [locked, ...rest].join("\n").trim() };
    });
  }
  for (const term of ctx.preserveTerms) {
    const missing = variants.filter((v) => !v.caption.toLowerCase().includes(term.toLowerCase()));
    if (missing.length) {
      limitations.push(
        `"${term}" is missing from option ${missing.map((v) => v.id).join(", ")}. Add it back before posting if it matters.`,
      );
    }
  }
  return {
    ...result,
    variants,
    hooks: ctx.emoji === "none" ? result.hooks.map(stripEmoji) : result.hooks,
    limitations: limitations.slice(0, 6),
  };
}

export function captionWithHashtags(caption: string, hashtags: string[]): string {
  const tags = hashtags.join(" ").trim();
  return tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
}
