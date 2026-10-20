import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getProfile } from "@/lib/repo/creator";
import { DEFAULT_LANG, LANG_COOKIE, getDict, isLang, type Lang } from "./index";

/**
 * UI language for this request: explicit cookie (set by the switcher) →
 * signed-in creator's saved preference → default. Never throws.
 */
export async function getLang(): Promise<Lang> {
  try {
    const c = (await cookies()).get(LANG_COOKIE)?.value;
    if (isLang(c)) return c;
    const user = await getCurrentUser();
    if (user) {
      const profile = await getProfile(await getDb(), user.id);
      if (profile && isLang(profile.uiLanguage)) return profile.uiLanguage;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_LANG;
}

export async function getServerDict() {
  const lang = await getLang();
  return { lang, d: getDict(lang) };
}
