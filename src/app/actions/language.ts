"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { upsertProfile } from "@/lib/repo/creator";
import { LANG_COOKIE, isLang } from "@/lib/i18n";

/** Switches the UI language everywhere: cookie for this browser + saved on the profile when signed in. */
export async function setLanguage(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    sameSite: "lax",
    secure: config().isProduction,
    maxAge: 60 * 60 * 24 * 365,
  });
  const user = await getCurrentUser();
  if (user) await upsertProfile(await getDb(), user.id, { uiLanguage: lang });
  revalidatePath("/", "layout");
}
