"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { destroyAllSessions, requireUser } from "@/lib/auth/session";
import { CATEGORY_IDS, LANGUAGE_IDS, REGION_IDS, TONE_IDS } from "@/lib/domain/options";
import { PLATFORM_IDS } from "@/lib/domain/platforms";
import { deleteAccount, deleteHistory, setConsent, upsertProfile } from "@/lib/repo/creator";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { LANG_COOKIE } from "@/lib/i18n";
import { getServerDict } from "@/lib/i18n/server";
import { TEAM_BY_ID } from "@/lib/domain/sports/entities";
import { TIMEZONES } from "@/lib/domain/sports/timezones";

/** Keep the language cookie in sync when the creator changes app language in a form. */
async function syncLangCookie(lang: string) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", secure: config().isProduction, maxAge: 60 * 60 * 24 * 365 });
}


const ProfileForm = z.object({
  displayName: z.string().trim().max(80).default(""),
  categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])).max(6).default([]),
  platforms: z.array(z.enum(PLATFORM_IDS)).max(7).default([]),
  contentLanguages: z.array(z.enum(LANGUAGE_IDS)).min(1).max(3).default(["hinglish"]),
  region: z.enum(REGION_IDS).default("IN"),
  defaultTone: z.enum(TONE_IDS).default("conversational"),
  uiLanguage: z.enum(["hinglish", "english", "hindi"]).default("hinglish"),
  styleNotes: z.string().trim().max(600).default(""),
  personalExamples: z.string().trim().max(1000).default(""),
  weeklyTimeHours: z.coerce.number().int().min(0).max(100).nullable().default(null),
  sports: z
    .object({
      sports: z.array(z.enum(["cricket", "football"])).max(2).default([]),
      teamIds: z.array(z.string().refine((id) => TEAM_BY_ID.has(id))).max(12).default([]),
      timezone: z.enum(TIMEZONES).default("Asia/Kolkata"),
    })
    .default({ sports: [], teamIds: [], timezone: "Asia/Kolkata" }),
});

export interface ProfileState {
  error?: string;
  saved?: boolean;
}

function parseForm(form: FormData) {
  const hours = form.get("weeklyTimeHours");
  return ProfileForm.safeParse({
    displayName: form.get("displayName") ?? "",
    categories: form.getAll("categories"),
    platforms: form.getAll("platforms"),
    contentLanguages: form.getAll("contentLanguages").length ? form.getAll("contentLanguages") : undefined,
    region: form.get("region") ?? undefined,
    defaultTone: form.get("defaultTone") ?? undefined,
    uiLanguage: form.get("uiLanguage") ?? undefined,
    styleNotes: form.get("styleNotes") ?? "",
    personalExamples: form.get("personalExamples") ?? "",
    weeklyTimeHours: hours === null || hours === "" ? null : hours,
    sports: { sports: form.getAll("sports"), teamIds: form.getAll("teamIds"), timezone: form.get("timezone") ?? undefined },
  });
}

export async function completeOnboarding(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = parseForm(form);
  if (!parsed.success) return { error: (await getServerDict()).d.onboarding.error };
  const db = await getDb();
  await upsertProfile(db, user.id, { ...parsed.data, onboardedAt: new Date() });
  await syncLangCookie(parsed.data.uiLanguage);
  redirect(form.get("next") === "studio" ? "/app/caption-studio" : "/app");
}

export async function skipOnboarding(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await upsertProfile(db, user.id, { onboardedAt: new Date() });
  redirect("/app/caption-studio");
}

export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = parseForm(form);
  if (!parsed.success) return { error: (await getServerDict()).d.profile.error };
  const db = await getDb();
  await upsertProfile(db, user.id, { ...parsed.data });
  await syncLangCookie(parsed.data.uiLanguage);
  revalidatePath("/app", "layout");
  return { saved: true };
}

export async function updateConsent(form: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await setConsent(db, user.id, form.get("granted") === "on");
  revalidatePath("/app/settings");
}

export async function deleteMyHistory(form: FormData): Promise<void> {
  const user = await requireUser();
  if (form.get("confirm") !== "DELETE") redirect("/app/settings?error=confirm");
  const db = await getDb();
  await deleteHistory(db, user.id);
  redirect("/app/settings?deleted=history");
}

export async function deleteMyAccount(form: FormData): Promise<void> {
  const user = await requireUser();
  if (form.get("confirm") !== "DELETE") redirect("/app/settings?error=confirm");
  const db = await getDb();
  await destroyAllSessions(user.id);
  await deleteAccount(db, user.id);
  redirect("/?account=deleted");
}

export async function signOutEverywhere(): Promise<void> {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  redirect("/signin");
}
