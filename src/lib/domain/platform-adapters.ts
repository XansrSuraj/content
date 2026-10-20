import { PLATFORMS, type PlatformId } from "./platforms";

/**
 * Per-platform output rules. Every limit carries its source and check date;
 * values we could not confirm from an official page are `unverified` and stay
 * configurable here (never enforced as hard facts in copy shown to creators).
 */

export interface LengthLimit {
  max: number;
  status: "official" | "unverified";
  sourceUrl: string | null;
  checkedOn: string;
}

export type OutputField = "caption" | "title" | "description";

export interface PlatformAdapter {
  id: PlatformId;
  /** Fields this platform's output has. YouTube: title + description; others: caption. */
  fields: OutputField[];
  limits: Partial<Record<OutputField, LengthLimit>>;
  /** Where hashtags go, in words the model can follow. */
  hashtagPlacement: string;
  ctaStyle: string;
  toneNotes: string;
  /** Wording that belongs to another platform and must never appear in this output. */
  forbiddenWording: RegExp[];
}

const CHECKED = "2026-10-20";
const YT_TITLE: LengthLimit = { max: 100, status: "official", sourceUrl: "https://support.google.com/youtube/answer/57404", checkedOn: CHECKED };
const YT_DESC: LengthLimit = { max: 5000, status: "official", sourceUrl: "https://support.google.com/youtube/answer/57404", checkedOn: CHECKED };
const IG_CAPTION: LengthLimit = {
  max: 2200,
  status: "official",
  sourceUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media",
  checkedOn: CHECKED,
};
// No official Meta page found for Facebook Reels/post text length; third-party guides say 63,206 for posts.
const FB_TEXT: LengthLimit = { max: 63206, status: "unverified", sourceUrl: null, checkedOn: CHECKED };
// TikTok: third parties disagree (2,200 via the posting API vs 4,000 in-app); the lower value is used.
const TT_CAPTION: LengthLimit = { max: 2200, status: "unverified", sourceUrl: null, checkedOn: CHECKED };

const NOT_YOUTUBE = [/\breels?\b/i, /\bswipe up\b/i, /\blink in bio\b/i, /\bsave this (reel|post)\b/i, /\bstory\b.*\bswipe\b/i];
const NOT_INSTAGRAM = [/\bsubscribe\b/i, /\bshorts\b/i, /\bhit the bell\b/i, /\bbell icon\b/i, /\btiktok\b/i, /\bfyp\b/i];
const NOT_FACEBOOK_POST = [/\breel\b/i, /\bsubscribe\b/i, /\bshorts\b/i, /\bhit the bell\b/i];
const NOT_FACEBOOK_REEL = [/\bsubscribe\b/i, /\bshorts\b/i, /\bhit the bell\b/i, /\blink in bio\b/i];
const NOT_TIKTOK = [/\breels?\b/i, /\bsubscribe\b/i, /\bshorts\b/i, /\bhit the bell\b/i];

export const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  instagram_reels: {
    id: "instagram_reels",
    fields: ["caption"],
    limits: { caption: IG_CAPTION },
    hashtagPlacement: "At the end of the caption, after a line break.",
    ctaStyle: "One natural question or 'save/share' line that fits the video; never 'comment for shoutout'.",
    toneNotes: "First line must land without the 'more' tap (about the first 125 characters show). Short lines, conversational.",
    forbiddenWording: NOT_INSTAGRAM,
  },
  instagram_post: {
    id: "instagram_post",
    fields: ["caption"],
    limits: { caption: IG_CAPTION },
    hashtagPlacement: "At the end of the caption, after a line break.",
    ctaStyle: "A question or 'which one is your pick?' for carousels; no Reel wording.",
    toneNotes: "Can be a little longer; carousel posts can reference 'swipe' only if the creator says it is a carousel.",
    forbiddenWording: [...NOT_INSTAGRAM, /\breel\b/i],
  },
  youtube_shorts: {
    id: "youtube_shorts",
    fields: ["title", "description"],
    limits: { title: YT_TITLE, description: YT_DESC },
    hashtagPlacement: "In the description (up to 3 may show near the title). Never in the title unless the creator asks.",
    ctaStyle: "Subscribe or comment prompt in YouTube terms; no Instagram/Reel wording.",
    toneNotes: "Title: clear, searchable, under 100 characters, names the subject. Description: 1–3 short lines of context.",
    forbiddenWording: NOT_YOUTUBE,
  },
  youtube: {
    id: "youtube",
    fields: ["title", "description"],
    limits: { title: YT_TITLE, description: YT_DESC },
    hashtagPlacement: "In the description (up to 3 may show near the title).",
    ctaStyle: "Subscribe/comment prompt in YouTube terms; may invite viewers to watch till the end only if the creator's video supports it.",
    toneNotes: "Title: searchable, names teams/players/topic, under 100 characters. Description: first 2 lines carry the summary.",
    forbiddenWording: NOT_YOUTUBE,
  },
  facebook_reels: {
    id: "facebook_reels",
    fields: ["caption"],
    limits: { caption: FB_TEXT },
    hashtagPlacement: "At the end, 1–3 tags.",
    ctaStyle: "Share/comment prompt in plain language.",
    toneNotes: "Friendly, slightly broader audience than Instagram.",
    forbiddenWording: NOT_FACEBOOK_REEL,
  },
  facebook_post: {
    id: "facebook_post",
    fields: ["caption"],
    limits: { caption: FB_TEXT },
    hashtagPlacement: "At the end, 1–3 tags.",
    ctaStyle: "A discussion question; no Reel wording.",
    toneNotes: "Can be a fuller paragraph; conversational.",
    forbiddenWording: NOT_FACEBOOK_POST,
  },
  tiktok: {
    id: "tiktok",
    fields: ["caption"],
    limits: { caption: TT_CAPTION },
    hashtagPlacement: "At the end of the caption.",
    ctaStyle: "Comment prompt in TikTok terms; no Reel/Shorts wording.",
    toneNotes: "Very short, hook-first.",
    forbiddenWording: NOT_TIKTOK,
  },
};

export function adapterFor(id: string): PlatformAdapter {
  return ADAPTERS[(id in ADAPTERS ? id : PLATFORMS[0].id) as PlatformId];
}

/** Human-readable form of a forbidden-wording pattern, for prompts and validator messages. */
export function wordingLabel(re: RegExp): string {
  return re.source
    .replace(/\\b/g, "")
    .replace(/s\?/g, "")
    .replace(/\.\*/g, " … ")
    .replace(/\(([^)]*)\)/g, "$1")
    .replace(/\|/g, " / ")
    .trim();
}
