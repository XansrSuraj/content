import { en, type Dict } from "./en";
import { hinglish } from "./hinglish";
import { hindi } from "./hindi";

/** App UI language. Separate from the caption (content) language a creator writes in. */
export type Lang = "english" | "hinglish" | "hindi";
export const LANGS: Lang[] = ["english", "hinglish", "hindi"];
export const DEFAULT_LANG: Lang = "hinglish";
export const LANG_COOKIE = "ts_lang";

const DICTS: Record<Lang, Dict> = { english: en, hinglish, hindi };

export function isLang(v: unknown): v is Lang {
  return v === "english" || v === "hinglish" || v === "hindi";
}

export function getDict(lang: Lang): Dict {
  return DICTS[lang] ?? DICTS[DEFAULT_LANG];
}

/** Locale for dates/numbers. Hindi uses Devanagari digits off — Latin digits read better in mixed UIs. */
export function localeFor(lang: Lang): string {
  return lang === "hindi" ? "hi-IN" : "en-IN";
}

export type { Dict };
