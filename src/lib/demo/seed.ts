import { and, eq, max, notInArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { opportunities, opportunityEvidence, sourceObservations, users } from "@/lib/db/schema";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import { evidenceConfidence } from "@/lib/domain/opportunities";
import { addMessage, createConversation } from "@/lib/repo/studio";
import { DEMO_EXAMPLE_INPUT, DEMO_EXAMPLE_RESULT, DEMO_OPPORTUNITIES } from "./fixtures";

const RESEED_AFTER_HOURS = 24;

/**
 * Idempotently (re)creates the demo catalogue. Opportunity ids are stable so
 * demo users' saved items survive a refresh; demo observation times are
 * relative to the seed time and always carry isDemo=true.
 */
export async function ensureDemoCatalog(db: DB, now: Date = new Date()): Promise<void> {
  const [latest] = await db
    .select({ at: max(sourceObservations.retrievedAt) })
    .from(sourceObservations)
    .where(eq(sourceObservations.isDemo, true));
  const existing = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(eq(opportunities.isDemo, true), eq(opportunities.status, "published")));
  const ids = DEMO_OPPORTUNITIES.map((o) => o.id);
  // Reseed when stale or when the fixture list changed (e.g. older non-sports demo ideas are still published).
  const sameSet = existing.length === ids.length && existing.every((e) => ids.includes(e.id));
  const fresh = latest?.at && now.getTime() - new Date(latest.at).getTime() < RESEED_AFTER_HOURS * 3_600_000;
  if (sameSet && fresh) return;

  await db.transaction(async (tx) => {
    await tx.delete(sourceObservations).where(eq(sourceObservations.isDemo, true));
    // Demo ideas dropped from the fixtures are archived, not deleted, so saved references stay valid.
    await tx
      .update(opportunities)
      .set({ status: "archived" })
      .where(and(eq(opportunities.isDemo, true), notInArray(opportunities.id, ids)));
    for (const o of DEMO_OPPORTUNITIES) {
      const obsRows = o.observations.map((ob, i) => ({
        sourceKey: "demo_sample",
        dedupeKey: `demo|${o.id}|${i}`,
        externalId: o.id,
        title: `${o.title} (demo sample)`,
        url: null,
        observedAt: new Date(now.getTime() - ob.hoursAgo * 3_600_000),
        retrievedAt: now,
        geo: "IN",
        language: o.languages[0] ?? null,
        platform: ob.platform,
        rank: ob.rank,
        metricName: "demo_rank",
        metricValue: ob.rank,
        coverageNote: "Demo sample data written for this demo. Not a real observation.",
        hashtags: ob.hashtags,
        isDemo: true,
      }));
      const inserted = obsRows.length ? await tx.insert(sourceObservations).values(obsRows).returning() : [];
      const values = {
        title: o.title,
        kind: o.kind,
        group: o.group,
        categories: o.categories,
        languages: o.languages,
        regions: o.regions,
        platforms: o.platforms,
        summary: o.summary,
        fitReason: o.fitReason,
        angles: o.angles,
        effort: o.effort,
        suggestedHashtags: o.suggestedHashtags,
        sensitivityNote: o.sensitivityNote ?? null,
        evidenceConfidence: evidenceConfidence(inserted),
        status: "published" as const,
        isDemo: true,
      };
      await tx
        .insert(opportunities)
        .values({ id: o.id, ...values })
        .onConflictDoUpdate({ target: opportunities.id, set: values });
      if (inserted.length) {
        await tx
          .insert(opportunityEvidence)
          .values(inserted.map((r) => ({ opportunityId: o.id, observationId: r.id })))
          .onConflictDoNothing();
      }
    }
  });
}

/** Each demo visitor gets their own isolated account — never a shared identity. */
export async function createDemoUser(db: DB): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `demo-${crypto.randomUUID()}@demo.trendsaathi.local`, isDemo: true, role: "creator" })
    .returning();
  await ensureDemoCatalog(db);
  const conv = await createConversation(db, user.id, {
    title: "Example: gully cricket last-ball six",
    context: { ...DEFAULT_CONTEXT, platform: "instagram_reels", language: "hinglish" },
    isExample: true,
  });
  await addMessage(db, user.id, conv.id, { role: "user", text: DEMO_EXAMPLE_INPUT });
  await addMessage(db, user.id, conv.id, { role: "assistant", text: "", result: DEMO_EXAMPLE_RESULT, mode: "example" });
  return user.id;
}

export async function cleanupOldDemoUsers(db: DB, olderThanDays = 3): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const { lt } = await import("drizzle-orm");
  const rows = await db
    .delete(users)
    .where(and(eq(users.isDemo, true), lt(users.createdAt, cutoff)))
    .returning({ id: users.id });
  return rows.length;
}
