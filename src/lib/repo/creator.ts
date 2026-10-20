import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import {
  briefs,
  captionVariants,
  consents,
  conversations,
  creatorProfiles,
  events,
  feedback,
  publishedPosts,
  savedItems,
  sessions,
  usageRecords,
  users,
} from "@/lib/db/schema";

export type Profile = typeof creatorProfiles.$inferSelect;

export async function getProfile(db: DB, userId: string): Promise<Profile | null> {
  const rows = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export type ProfileInput = Partial<Omit<Profile, "userId" | "updatedAt">>;

export async function upsertProfile(db: DB, userId: string, input: ProfileInput): Promise<Profile> {
  const values = { ...input, userId, updatedAt: new Date() };
  const rows = await db
    .insert(creatorProfiles)
    .values(values)
    .onConflictDoUpdate({ target: creatorProfiles.userId, set: { ...input, updatedAt: new Date() } })
    .returning();
  return rows[0];
}

export async function setConsent(db: DB, userId: string, granted: boolean): Promise<void> {
  await db.insert(consents).values({ userId, kind: "personalize_from_feedback", granted });
}

/** Latest consent record wins. Default: personalization from own feedback is on (own data only). */
export async function personalizationAllowed(db: DB, userId: string): Promise<boolean> {
  const rows = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.kind, "personalize_from_feedback")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return rows[0]?.granted ?? true;
}

// ---------- Events (ids and enums only) ----------

export type EventType =
  | "opportunity_saved"
  | "brief_generated"
  | "caption_generated"
  | "caption_selected"
  | "output_edited"
  | "published_link_submitted"
  | "recommendation_rejected"
  | "generation_succeeded"
  | "match_corrected"
  | "recommended_copied"
  | "hashtags_copied"
  | "caption_edited"
  | "marked_useful"
  | "marked_not_useful";

export async function recordEvent(
  db: DB,
  userId: string,
  type: EventType,
  payload: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await db.insert(events).values({ userId, type, payload });
}

export async function eventCounts(db: DB, userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ type: events.type, n: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.userId, userId))
    .groupBy(events.type);
  return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
}

// ---------- Feedback ----------

export type FeedbackInput = Pick<typeof feedback.$inferInsert, "targetType" | "targetId" | "verdict" | "reason">;

export async function addFeedback(db: DB, userId: string, input: FeedbackInput) {
  const rows = await db.insert(feedback).values({ ...input, userId }).returning();
  return rows[0];
}

export async function listFeedback(db: DB, userId: string, targetType?: FeedbackInput["targetType"]) {
  return db
    .select()
    .from(feedback)
    .where(targetType ? and(eq(feedback.userId, userId), eq(feedback.targetType, targetType)) : eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt));
}

// ---------- Usage ----------

export async function recordUsage(db: DB, row: typeof usageRecords.$inferInsert): Promise<void> {
  await db.insert(usageRecords).values(row);
}

export async function usageSince(db: DB, userId: string, since: Date) {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, userId), gte(usageRecords.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

// ---------- Deletion ----------

/** Deletes all creator-generated history but keeps the account and profile. */
export async function deleteHistory(db: DB, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(captionVariants).where(eq(captionVariants.userId, userId));
    await tx.delete(conversations).where(eq(conversations.userId, userId));
    await tx.delete(briefs).where(eq(briefs.userId, userId));
    await tx.delete(savedItems).where(eq(savedItems.userId, userId));
    await tx.delete(publishedPosts).where(eq(publishedPosts.userId, userId));
    await tx.delete(feedback).where(eq(feedback.userId, userId));
    await tx.delete(events).where(eq(events.userId, userId));
  });
}

/** Removes the account; every owned table cascades on users.id. */
export async function deleteAccount(db: DB, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
