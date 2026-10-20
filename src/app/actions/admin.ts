"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { sourceObservations } from "@/lib/db/schema";
import { CATEGORY_IDS, LANGUAGE_IDS, REGION_IDS } from "@/lib/domain/options";
import { PLATFORM_IDS } from "@/lib/domain/platforms";
import { dedupeHashtags } from "@/lib/domain/hashtags";
import { evidenceConfidence } from "@/lib/domain/opportunities";
import { buildConnector, runIngestion } from "@/lib/jobs/ingest";
import { createOpportunityFromObservations, setOpportunityStatus } from "@/lib/repo/discovery";
import { cleanupOldDemoUsers } from "@/lib/demo/seed";
import { addReferences, deleteSharedReference } from "@/lib/repo/sports";
import { looksLikeTrendsCsv, parseTrendsCsv } from "@/lib/domain/trends-csv";
import { ReferenceTopic, describesInWords } from "@/lib/domain/references";

export async function runSourceNow(sourceKey: string): Promise<void> {
  await requireAdmin();
  const connector = buildConnector(z.string().max(64).parse(sourceKey), config());
  if (!connector) redirect("/admin?ingest=not_configured");
  const db = await getDb();
  const res = await runIngestion(db, connector, { trigger: "manual", force: true });
  redirect(`/admin?ingest=${res.status}&new=${res.itemsNew}`);
}

const Promote = z.object({
  observationIds: z.array(z.string().max(64)).min(0).max(20),
  title: z.string().trim().min(3).max(200),
  kind: z.enum(["topic", "person", "event", "idea"]),
  group: z.enum(["timely", "plan", "evergreen"]),
  categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])).min(1).max(6),
  languages: z.array(z.enum(LANGUAGE_IDS)).min(1),
  regions: z.array(z.enum(REGION_IDS)).min(1),
  platforms: z.array(z.enum(PLATFORM_IDS)).min(1),
  summary: z.string().trim().min(10).max(600),
  fitReason: z.string().trim().min(10).max(600),
  angles: z.string().max(3000),
  effort: z.enum(["low", "medium", "high"]),
  hashtags: z.string().max(500),
  sensitivityNote: z.string().trim().max(400),
});

export interface PromoteState {
  error?: string;
}

export async function promoteObservations(_prev: PromoteState, form: FormData): Promise<PromoteState> {
  await requireAdmin();
  const parsed = Promote.safeParse({
    observationIds: form.getAll("observationIds"),
    title: form.get("title"),
    kind: form.get("kind"),
    group: form.get("group"),
    categories: form.getAll("categories"),
    languages: form.getAll("languages"),
    regions: form.getAll("regions"),
    platforms: form.getAll("platforms"),
    summary: form.get("summary"),
    fitReason: form.get("fitReason"),
    angles: form.get("angles") ?? "",
    effort: form.get("effort"),
    hashtags: form.get("hashtags") ?? "",
    sensitivityNote: form.get("sensitivityNote") ?? "",
  });
  if (!parsed.success) return { error: `Check: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` };
  const d = parsed.data;
  const angles = d.angles
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => {
      const [title, ...rest] = l.split(":");
      return { title: title.trim().slice(0, 100), description: rest.join(":").trim().slice(0, 400) || title.trim() };
    });
  if (!angles.length) return { error: "Add at least one original angle (one per line, “Title: description”)." };

  const db = await getDb();
  const obs = d.observationIds.length
    ? await db.select().from(sourceObservations).where(inArray(sourceObservations.id, d.observationIds))
    : [];
  const real = obs.filter((o) => !o.isDemo);
  const opp = await createOpportunityFromObservations(
    db,
    {
      title: d.title,
      kind: d.kind,
      group: d.group,
      categories: d.categories,
      languages: d.languages,
      regions: d.regions,
      platforms: d.platforms,
      summary: d.summary,
      fitReason: d.fitReason,
      angles,
      effort: d.effort,
      suggestedHashtags: dedupeHashtags(d.hashtags.split(/\s+/)).slice(0, 10),
      sensitivityNote: d.sensitivityNote || null,
      evidenceConfidence: evidenceConfidence(real),
      status: "published",
      isDemo: false,
    },
    real.map((o) => o.id),
  );
  redirect(`/admin?promoted=${opp.id}`);
}

export async function setStatusAction(id: string, status: "published" | "archived"): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await setOpportunityStatus(db, z.string().max(64).parse(id), status);
  revalidatePath("/admin");
}

export async function cleanupDemoAction(): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const n = await cleanupOldDemoUsers(db);
  redirect(`/admin?demoCleaned=${n}`);
}

// ---------- Manual platform evidence (what an admin saw in a platform's own tool) ----------

const SOURCE_TOOLS = ["TikTok Creative Center", "Reddit Pro Trends", "YouTube Studio Trends", "Instagram Reels trends", "Google Trends (YouTube Search)", "Other"] as const;

const ToolObservation = z.object({
  platform: z.enum(["instagram", "youtube", "tiktok", "facebook", "reddit", "google_search"]),
  sourceTool: z.enum(SOURCE_TOOLS),
  topic: ReferenceTopic,
  region: z.string().trim().max(20).default("IN"),
  url: z.union([z.literal(""), z.string().url().max(500)]).default(""),
  observedAt: z.string().max(30).default(""),
  note: z.string().trim().max(300).default(""),
});

/** Shared evidence: an admin records a trend they saw in a platform tool, with link and time. */
export async function addToolObservation(formData: FormData): Promise<void> {
  await requireAdmin();
  const p = ToolObservation.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect("/admin?ref=invalid#references");
  const observedAt = p.data.observedAt ? new Date(`${p.data.observedAt}:00+05:30`) : new Date();
  const db = await getDb();
  await addReferences(db, null, [
    {
      platform: p.data.platform,
      topic: p.data.topic,
      region: p.data.region || "IN",
      url: p.data.url || null,
      observedAt: Number.isNaN(observedAt.getTime()) ? new Date() : observedAt,
      evidenceType: "tool_observation",
      sourceTool: p.data.sourceTool,
      note: p.data.note,
    },
  ]);
  revalidatePath("/admin");
  redirect("/admin?ref=added#references");
}

/** Imports a Google Trends "related queries" CSV (e.g. with the YouTube Search filter). */
export async function importTrendsCsv(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  const platform = formData.get("platform") === "google_search" ? "google_search" : "youtube";
  const region = String(formData.get("region") ?? "IN").slice(0, 20) || "IN";
  if (!(file instanceof File) || file.size === 0 || file.size > 200_000) redirect("/admin?ref=invalid#references");
  // Validation: only real Trends exports (a TOP/RISING section or the "Category:" header) with usable rows.
  const text = await file.text();
  if (!looksLikeTrendsCsv(text)) redirect("/admin?ref=not_trends_csv#references");
  const rows = parseTrendsCsv(text).filter((r) => describesInWords(r.query));
  if (!rows.length) redirect("/admin?ref=empty#references");
  const db = await getDb();
  const n = await addReferences(
    db,
    null,
    rows.map((r) => ({
      platform,
      topic: r.query,
      region,
      url: null,
      observedAt: new Date(),
      evidenceType: "csv_import" as const,
      sourceTool: platform === "youtube" ? "Google Trends (YouTube Search)" : "Google Trends (Web Search)",
      note: `${r.section === "rising" ? "Rising" : "Top"} related query (${r.label})`,
      value: r.value,
    })),
  );
  revalidatePath("/admin");
  redirect(`/admin?ref=imported&n=${n}#references`);
}

export async function deleteToolObservation(id: string): Promise<void> {
  await requireAdmin();
  await deleteSharedReference(await getDb(), z.string().max(64).parse(id));
  revalidatePath("/admin");
}
