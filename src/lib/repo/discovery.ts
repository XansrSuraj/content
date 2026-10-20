import { and, desc, eq, gte, ilike, inArray, or, sql, type AnyColumn } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { ingestionRuns, opportunities, opportunityEvidence, sourceObservations, sources } from "@/lib/db/schema";
import type { HashtagEvidence } from "@/lib/domain/hashtags";
import { VERIFIED_MAX_AGE_HOURS } from "@/lib/domain/hashtags";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";

export type Opportunity = typeof opportunities.$inferSelect;
export type Observation = typeof sourceObservations.$inferSelect;
export type Dataset = "demo" | "observed";

export interface OpportunityFilters {
  dataset: Dataset;
  q?: string;
  category?: string;
  language?: string;
  region?: string;
  platform?: string;
  group?: Opportunity["group"];
}

function jsonHas(column: AnyColumn, value: string) {
  return sql`${column} @> ${JSON.stringify([value])}::jsonb`;
}

export async function listOpportunities(db: DB, f: OpportunityFilters): Promise<Opportunity[]> {
  const where = [eq(opportunities.status, "published"), eq(opportunities.isDemo, f.dataset === "demo")];
  if (f.q) {
    const pattern = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(opportunities.title, pattern), ilike(opportunities.summary, pattern))!);
  }
  if (f.category) where.push(jsonHas(opportunities.categories, f.category));
  if (f.language) where.push(jsonHas(opportunities.languages, f.language));
  if (f.platform) where.push(jsonHas(opportunities.platforms, f.platform));
  if (f.region && f.region !== "IN") {
    where.push(or(jsonHas(opportunities.regions, f.region), jsonHas(opportunities.regions, "IN"))!);
  }
  if (f.group) where.push(eq(opportunities.group, f.group));
  return db.select().from(opportunities).where(and(...where)).orderBy(desc(opportunities.createdAt)).limit(300);
}

/** Opportunities are shared catalogue data; demo items are only visible in the demo dataset. */
export async function getOpportunity(db: DB, id: string, dataset: Dataset | "any"): Promise<Opportunity | null> {
  const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  const opp = rows[0];
  if (!opp) return null;
  if (dataset !== "any" && opp.isDemo !== (dataset === "demo")) return null;
  return opp;
}

export async function evidenceFor(db: DB, opportunityIds: string[]): Promise<Map<string, Observation[]>> {
  const map = new Map<string, Observation[]>();
  if (!opportunityIds.length) return map;
  const rows = await db
    .select({ oppId: opportunityEvidence.opportunityId, obs: sourceObservations })
    .from(opportunityEvidence)
    .innerJoin(sourceObservations, eq(opportunityEvidence.observationId, sourceObservations.id))
    .where(inArray(opportunityEvidence.opportunityId, opportunityIds));
  for (const r of rows) map.set(r.oppId, [...(map.get(r.oppId) ?? []), r.obs]);
  return map;
}

/** All stored observations of the same items (for comparable momentum). */
export async function relatedObservations(db: DB, obs: Observation[]): Promise<Observation[]> {
  if (!obs.length) return [];
  const conds = obs.map((o) =>
    and(eq(sourceObservations.sourceKey, o.sourceKey), eq(sourceObservations.externalId, o.externalId), eq(sourceObservations.geo, o.geo)),
  );
  return db
    .select()
    .from(sourceObservations)
    .where(or(...conds))
    .orderBy(sourceObservations.observedAt)
    .limit(200);
}

/** Looks up hashtag evidence from stored observations (lower-cased tag → evidence). */
export async function hashtagEvidence(db: DB, tags: string[], includeDemo: boolean): Promise<Map<string, HashtagEvidence[]>> {
  const map = new Map<string, HashtagEvidence[]>();
  // Only normalized hashtags (letters, marks, digits, underscore) can reach the raw array below.
  const lower = [...new Set(tags.map((t) => t.toLowerCase()))].filter((t) => /^#[\p{L}\p{M}\p{N}_]{1,60}$/u.test(t));
  if (!lower.length) return map;
  const since = new Date(Date.now() - VERIFIED_MAX_AGE_HOURS * 3_600_000);
  const rows = await db
    .select()
    .from(sourceObservations)
    .where(
      and(
        gte(sourceObservations.observedAt, since),
        includeDemo ? undefined : eq(sourceObservations.isDemo, false),
        sql`exists (select 1 from jsonb_array_elements_text(${sourceObservations.hashtags}) t where lower(t) = any(${sql.raw(
          `ARRAY[${lower.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`,
        )}))`,
      ),
    )
    .limit(500);
  for (const o of rows) {
    for (const t of o.hashtags) {
      const k = t.toLowerCase();
      if (!lower.includes(k)) continue;
      map.set(k, [
        ...(map.get(k) ?? []),
        {
          sourceKey: o.sourceKey,
          sourceName: SOURCE_NAMES[o.sourceKey] ?? o.sourceKey,
          platform: o.platform,
          geo: o.geo,
          observedAt: o.observedAt,
          retrievedAt: o.retrievedAt,
          coverageNote: o.coverageNote,
          url: o.url,
          isDemo: o.isDemo,
        },
      ]);
    }
  }
  return map;
}

// ---------- Admin / ingestion ----------

export async function listObservations(db: DB, opts: { sourceKey?: string; limit?: number; includeDemo?: boolean }) {
  return db
    .select()
    .from(sourceObservations)
    .where(
      and(
        opts.sourceKey ? eq(sourceObservations.sourceKey, opts.sourceKey) : undefined,
        opts.includeDemo ? undefined : eq(sourceObservations.isDemo, false),
      ),
    )
    .orderBy(desc(sourceObservations.retrievedAt))
    .limit(opts.limit ?? 100);
}

export async function getObservation(db: DB, id: string): Promise<Observation | null> {
  const rows = await db.select().from(sourceObservations).where(eq(sourceObservations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listRuns(db: DB, limit = 20) {
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(limit);
}

export async function listSourceRows(db: DB) {
  return db.select().from(sources);
}

export async function createOpportunityFromObservations(
  db: DB,
  input: Omit<typeof opportunities.$inferInsert, "id" | "createdAt">,
  observationIds: string[],
): Promise<Opportunity> {
  return db.transaction(async (tx) => {
    const rows = await tx.insert(opportunities).values(input).returning();
    const opp = rows[0];
    if (observationIds.length) {
      await tx
        .insert(opportunityEvidence)
        .values(observationIds.map((observationId) => ({ opportunityId: opp.id, observationId })))
        .onConflictDoNothing();
    }
    return opp;
  });
}

export async function setOpportunityStatus(db: DB, id: string, status: Opportunity["status"]) {
  await db.update(opportunities).set({ status }).where(eq(opportunities.id, id));
}

export async function listAllOpportunitiesForAdmin(db: DB) {
  return db
    .select()
    .from(opportunities)
    .where(eq(opportunities.isDemo, false))
    .orderBy(desc(opportunities.createdAt))
    .limit(200);
}
