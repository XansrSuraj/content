"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { destroyAllSessions, requireUser } from "@/lib/auth/session";
import { CATEGORY_IDS, LANGUAGE_IDS, REGION_IDS, TONE_IDS } from "@/lib/domain/options";
import { PLATFORM_IDS } from "@/lib/domain/platforms";
import { deleteAccount, deleteHistory, setConsent, upsertProfile } from "@/lib/repo/creator";

const ProfileForm = z.object({
  displayName: z.string().trim().max(80).default(""),
  categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])).max(6).default([]),
  platforms: z.array(z.enum(PLATFORM_IDS)).max(7).default([]),
  contentLanguages: z.array(z.enum(LANGUAGE_IDS)).min(1).max(3).default(["hinglish"]),
  region: z.enum(REGION_IDS).default("IN"),
  defaultTone: z.enum(TONE_IDS).default("conversational"),
  uiLanguage: z.enum(["hinglish", "english"]).default("hinglish"),
  styleNotes: z.string().trim().max(600).default(""),
  personalExamples: z.string().trim().max(1000).default(""),
  weeklyTimeHours: z.coerce.number().int().min(0).max(100).nullable().default(null),
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
  });
}

export async function completeOnboarding(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = parseForm(form);
  if (!parsed.success) return { error: "Please check the highlighted choices." };
  const db = await getDb();
  await upsertProfile(db, user.id, { ...parsed.data, onboardedAt: new Date() });
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
  if (!parsed.success) return { error: "Please check your choices." };
  const db = await getDb();
  await upsertProfile(db, user.id, { ...parsed.data });
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
