"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { feedback } from "@/lib/db/schema";
import { BriefContentSchema, BriefRequestSchema } from "@/lib/domain/briefs";
import { PLATFORM_IDS, getPlatform } from "@/lib/domain/platforms";
import { addFeedback, recordEvent } from "@/lib/repo/creator";
import { getOpportunity } from "@/lib/repo/discovery";
import { getVariant } from "@/lib/repo/studio";
import {
  addPublished,
  deleteBrief,
  deletePublished,
  getBrief,
  saveItem,
  unsaveItem,
  updateBrief,
  updatePublished,
} from "@/lib/repo/work";
import { generateBrief } from "@/lib/services/briefs";
import { config } from "@/lib/config";
import { getServerDict } from "@/lib/i18n/server";

const Id = z.string().min(1).max(64);

// ---------- Opportunities ----------

export async function toggleSaveOpportunity(oppId: string, currentlySaved: boolean): Promise<void> {
  const user = await requireUser();
  const id = Id.parse(oppId);
  const db = await getDb();
  if (currentlySaved) {
    await unsaveItem(db, user.id, "opportunity", id);
  } else {
    const opp = await getOpportunity(db, id, user.isDemo && config().demoEnabled ? "any" : "observed");
    if (!opp) return;
    await saveItem(db, user.id, "opportunity", id);
    await recordEvent(db, user.id, "opportunity_saved", { opportunityId: id });
  }
  revalidatePath("/app/opportunities");
  revalidatePath(`/app/opportunities/${id}`);
  revalidatePath("/app/saved");
}

export async function rejectOpportunity(oppId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const id = Id.parse(oppId);
  const reason = z.string().max(200).catch("").parse(form.get("reason") ?? "");
  const db = await getDb();
  await addFeedback(db, user.id, { targetType: "opportunity", targetId: id, verdict: "rejected", reason });
  await recordEvent(db, user.id, "recommendation_rejected", { opportunityId: id, hasReason: Boolean(reason) });
  await unsaveItem(db, user.id, "opportunity", id);
  redirect("/app/opportunities?hidden=1");
}

export async function clearRejections(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await db
    .delete(feedback)
    .where(and(eq(feedback.userId, user.id), eq(feedback.targetType, "opportunity"), eq(feedback.verdict, "rejected")));
  revalidatePath("/app/opportunities");
}

// ---------- Briefs ----------

export interface BriefFormState {
  error?: string;
}

export async function createBriefAction(_prev: BriefFormState, form: FormData): Promise<BriefFormState> {
  const user = await requireUser();
  const minutes = form.get("availableMinutes");
  const parsed = BriefRequestSchema.safeParse({
    topic: form.get("topic"),
    opportunityId: form.get("opportunityId") || null,
    platform: form.get("platform") || undefined,
    language: form.get("language") || undefined,
    tone: form.get("tone") || undefined,
    angle: form.get("angle") ?? "",
    availableMinutes: minutes ? Number(minutes) : null,
    personalExample: form.get("personalExample") ?? "",
  });
  const { d } = await getServerDict();
  if (!parsed.success) return { error: d.briefs.errors.invalid };
  const db = await getDb();
  const res = await generateBrief(db, user, parsed.data);
  if (!res.ok) {
    const e = res.error;
    if (e.kind === "provider") return { error: `${d.studio.errors.byCode[e.code] ?? e.message}${e.retryable ? d.briefs.errors.retry : ""}` };
    if (e.kind === "quota") return { error: d.studio.errors.byCode.quota };
    if (e.kind === "not_found") return { error: d.briefs.errors.gone };
    return { error: d.briefs.errors.failed };
  }
  redirect(`/app/briefs/${res.brief.id}`);
}

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function updateBriefAction(briefId: string, _prev: BriefFormState, form: FormData): Promise<BriefFormState> {
  const user = await requireUser();
  const db = await getDb();
  const { d } = await getServerDict();
  const brief = await getBrief(db, user.id, Id.parse(briefId));
  if (!brief) return { error: d.briefs.editor.notFound };
  const current = BriefContentSchema.parse(brief.content);
  const next = BriefContentSchema.safeParse({
    ...current,
    originalAngle: String(form.get("originalAngle") ?? ""),
    intendedAudience: String(form.get("intendedAudience") ?? ""),
    hooks: lines(form.get("hooks")),
    openingShot: String(form.get("openingShot") ?? ""),
    beats: lines(form.get("beats")).map((l) => {
      const [beat, ...rest] = l.split(":");
      return rest.length ? { beat: beat.trim().slice(0, 120), detail: rest.join(":").trim() } : { beat: "Beat", detail: l };
    }),
    callToAction: String(form.get("callToAction") ?? ""),
    titleOptions: lines(form.get("titleOptions")),
    hashtags: String(form.get("hashtags") ?? "").split(/\s+/).filter(Boolean),
    factsToVerify: lines(form.get("factsToVerify")),
    lowEffortVersion: String(form.get("lowEffortVersion") ?? ""),
  });
  if (!next.success) return { error: d.briefs.editor.error };
  await updateBrief(db, user.id, brief.id, next.data);
  await recordEvent(db, user.id, "output_edited", { target: "brief", briefId: brief.id });
  redirect(`/app/briefs/${brief.id}?saved=1`);
}

export async function deleteBriefAction(briefId: string): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await deleteBrief(db, user.id, Id.parse(briefId));
  await unsaveItem(db, user.id, "brief", briefId);
  redirect("/app/briefs");
}

export async function toggleSaveBrief(briefId: string, currentlySaved: boolean): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const brief = await getBrief(db, user.id, Id.parse(briefId));
  if (!brief) return;
  if (currentlySaved) await unsaveItem(db, user.id, "brief", brief.id);
  else await saveItem(db, user.id, "brief", brief.id);
  revalidatePath(`/app/briefs/${brief.id}`);
  revalidatePath("/app/saved");
}

// ---------- Feedback ----------

export async function sendFeedback(targetType: "brief" | "variant" | "opportunity" | "conversation", targetId: string, form: FormData) {
  const user = await requireUser();
  const verdict = z.enum(["useful", "not_useful"]).parse(form.get("verdict"));
  const reason = z.string().max(300).catch("").parse(form.get("reason") ?? "");
  const db = await getDb();
  await addFeedback(db, user.id, { targetType, targetId: Id.parse(targetId), verdict, reason });
  revalidatePath("/app", "layout");
}

// ---------- Published posts ----------

const PLATFORM_HOSTS: Record<string, RegExp> = {
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
};

const PublishedForm = z.object({
  platform: z.enum(PLATFORM_IDS),
  url: z.string().trim().url().max(500),
  publishedAt: z.string().min(8).max(40),
  variantId: z.string().max(64).optional(),
  briefId: z.string().max(64).optional(),
  notes: z.string().max(1000).default(""),
});

export interface PublishedState {
  error?: string;
  ok?: boolean;
}

export async function addPublishedAction(_prev: PublishedState, form: FormData): Promise<PublishedState> {
  const user = await requireUser();
  const parsed = PublishedForm.safeParse({
    platform: form.get("platform"),
    url: form.get("url"),
    publishedAt: form.get("publishedAt"),
    variantId: form.get("variantId") || undefined,
    briefId: form.get("briefId") || undefined,
    notes: form.get("notes") ?? "",
  });
  const { d } = await getServerDict();
  if (!parsed.success) return { error: d.published.errors.invalid };
  const url = new URL(parsed.data.url);
  if (url.protocol !== "https:") return { error: d.published.errors.https };
  const family = getPlatform(parsed.data.platform).family;
  if (!PLATFORM_HOSTS[family].test(url.hostname)) {
    return { error: d.published.errors.platform(getPlatform(parsed.data.platform).label) };
  }
  // datetime-local has no zone; the form is labeled and pre-filled in IST.
  const rawDate = parsed.data.publishedAt;
  const publishedAt = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(rawDate) ? rawDate : `${rawDate}+05:30`);
  if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() > Date.now() + 86_400_000) {
    return { error: d.published.errors.date };
  }
  const db = await getDb();
  // Linked items must belong to the same user.
  const variantId = parsed.data.variantId && (await getVariant(db, user.id, parsed.data.variantId)) ? parsed.data.variantId : null;
  const briefId = parsed.data.briefId && (await getBrief(db, user.id, parsed.data.briefId)) ? parsed.data.briefId : null;
  const post = await addPublished(db, user.id, {
    platform: parsed.data.platform,
    url: url.toString(),
    publishedAt,
    variantId,
    briefId,
    notes: parsed.data.notes,
  });
  await recordEvent(db, user.id, "published_link_submitted", { postId: post.id, platform: post.platform, linkedVariant: Boolean(variantId) });
  revalidatePath("/app/published");
  return { ok: true };
}

const MetricField = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().int().min(0).max(1e10).optional());

export async function updatePublishedAction(postId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const outcome = z.enum(["better", "usual", "worse", "unknown"]).catch("unknown").parse(form.get("outcome"));
  const metrics: Record<string, number> = {};
  for (const k of ["views", "likes", "comments", "shares", "saves"]) {
    const v = MetricField.safeParse(form.get(k));
    if (v.success && v.data !== undefined) metrics[k] = v.data;
  }
  const notes = z.string().max(1000).catch("").parse(form.get("notes") ?? "");
  const db = await getDb();
  await updatePublished(db, user.id, Id.parse(postId), { outcome, manualMetrics: metrics, notes });
  revalidatePath("/app/published");
}

export async function deletePublishedAction(postId: string): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await deletePublished(db, user.id, Id.parse(postId));
  revalidatePath("/app/published");
}

export async function unsaveAction(kind: "opportunity" | "brief" | "variant" | "conversation", refId: string): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await unsaveItem(db, user.id, kind, Id.parse(refId));
  revalidatePath("/app/saved");
}
