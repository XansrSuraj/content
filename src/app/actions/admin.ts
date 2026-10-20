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
