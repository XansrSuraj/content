import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { briefs, publishedPosts, savedItems } from "@/lib/db/schema";
import type { BriefContent } from "@/lib/domain/briefs";
import type { GenerationMode } from "@/lib/domain/captions";

export type Brief = typeof briefs.$inferSelect;
export type SavedItem = typeof savedItems.$inferSelect;
export type PublishedPost = typeof publishedPosts.$inferSelect;

// ---------- Briefs ----------

export async function createBrief(
  db: DB,
  userId: string,
  input: { opportunityId: string | null; topic: string; platform: string; content: BriefContent; mode: GenerationMode },
): Promise<Brief> {
  const rows = await db
    .insert(briefs)
    .values({ ...input, userId, content: input.content as unknown as Record<string, unknown> })
    .returning();
  return rows[0];
}

export async function listBriefs(db: DB, userId: string): Promise<Brief[]> {
  return db.select().from(briefs).where(eq(briefs.userId, userId)).orderBy(desc(briefs.updatedAt)).limit(200);
}

export async function getBrief(db: DB, userId: string, id: string): Promise<Brief | null> {
  const rows = await db.select().from(briefs).where(and(eq(briefs.id, id), eq(briefs.userId, userId))).limit(1);
  return rows[0] ?? null;
}

export async function updateBrief(db: DB, userId: string, id: string, content: BriefContent): Promise<Brief | null> {
  const rows = await db
    .update(briefs)
    .set({ content: content as unknown as Record<string, unknown>, edited: true, updatedAt: new Date() })
    .where(and(eq(briefs.id, id), eq(briefs.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteBrief(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(briefs)
    .where(and(eq(briefs.id, id), eq(briefs.userId, userId)))
    .returning({ id: briefs.id });
  return rows.length > 0;
}

// ---------- Saved items ----------

export async function saveItem(
  db: DB,
  userId: string,
  kind: SavedItem["kind"],
  refId: string,
  note = "",
): Promise<SavedItem> {
  const rows = await db
    .insert(savedItems)
    .values({ userId, kind, refId, note })
    .onConflictDoUpdate({ target: [savedItems.userId, savedItems.kind, savedItems.refId], set: { note } })
    .returning();
  return rows[0];
}

export async function unsaveItem(db: DB, userId: string, kind: SavedItem["kind"], refId: string): Promise<boolean> {
  const rows = await db
    .delete(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.kind, kind), eq(savedItems.refId, refId)))
    .returning({ id: savedItems.id });
  return rows.length > 0;
}

export async function listSaved(db: DB, userId: string, kind?: SavedItem["kind"]): Promise<SavedItem[]> {
  return db
    .select()
    .from(savedItems)
    .where(kind ? and(eq(savedItems.userId, userId), eq(savedItems.kind, kind)) : eq(savedItems.userId, userId))
    .orderBy(desc(savedItems.createdAt));
}

export async function savedRefIds(db: DB, userId: string, kind: SavedItem["kind"], refIds: string[]): Promise<Set<string>> {
  if (!refIds.length) return new Set();
  const rows = await db
    .select({ refId: savedItems.refId })
    .from(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.kind, kind), inArray(savedItems.refId, refIds)));
  return new Set(rows.map((r) => r.refId));
}

// ---------- Published posts ----------

export async function addPublished(
  db: DB,
  userId: string,
  input: Omit<typeof publishedPosts.$inferInsert, "id" | "userId" | "createdAt">,
): Promise<PublishedPost> {
  const rows = await db.insert(publishedPosts).values({ ...input, userId }).returning();
  return rows[0];
}

export async function listPublished(db: DB, userId: string): Promise<PublishedPost[]> {
  return db
    .select()
    .from(publishedPosts)
    .where(eq(publishedPosts.userId, userId))
    .orderBy(desc(publishedPosts.publishedAt))
    .limit(500);
}

export async function updatePublished(
  db: DB,
  userId: string,
  id: string,
  patch: Partial<Pick<PublishedPost, "notes" | "manualMetrics" | "outcome">>,
): Promise<PublishedPost | null> {
  const rows = await db
    .update(publishedPosts)
    .set(patch)
    .where(and(eq(publishedPosts.id, id), eq(publishedPosts.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deletePublished(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(publishedPosts)
    .where(and(eq(publishedPosts.id, id), eq(publishedPosts.userId, userId)))
    .returning({ id: publishedPosts.id });
  return rows.length > 0;
}
