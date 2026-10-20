import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { captionVariants, conversations, messages, type SportsContextUsed, type TrendContextItem } from "@/lib/db/schema";
import type { EvidenceBundle } from "@/lib/domain/evidence";
import type { CaptionContext, CaptionResult, GenerationMode } from "@/lib/domain/captions";

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Variant = typeof captionVariants.$inferSelect;

export async function listConversations(db: DB, userId: string) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      isExample: conversations.isExample,
      context: conversations.context,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);
}

/** Returns null both when missing and when owned by someone else. */
export async function getConversation(db: DB, userId: string, id: string): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createConversation(
  db: DB,
  userId: string,
  input: { title: string; context: CaptionContext; opportunityId?: string | null; briefId?: string | null; isExample?: boolean },
): Promise<Conversation> {
  const rows = await db
    .insert(conversations)
    .values({
      userId,
      title: input.title.slice(0, 120),
      context: input.context as unknown as Record<string, unknown>,
      opportunityId: input.opportunityId ?? null,
      briefId: input.briefId ?? null,
      isExample: input.isExample ?? false,
    })
    .returning();
  return rows[0];
}

export async function updateConversation(
  db: DB,
  userId: string,
  id: string,
  patch: { title?: string; context?: CaptionContext },
): Promise<Conversation | null> {
  const rows = await db
    .update(conversations)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.slice(0, 120) } : {}),
      ...(patch.context ? { context: patch.context as unknown as Record<string, unknown> } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

/** Deletes specific messages of an owned conversation (used when a creator stops a turn that was already saved). */
export async function deleteMessages(db: DB, userId: string, conversationId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const conv = await getConversation(db, userId, conversationId);
  if (!conv) return 0;
  const rows = await db
    .delete(messages)
    .where(and(eq(messages.conversationId, conversationId), inArray(messages.id, ids)))
    .returning({ id: messages.id });
  return rows.length;
}

export async function deleteConversation(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });
  return rows.length > 0;
}

export async function listMessages(db: DB, userId: string, conversationId: string): Promise<Message[]> {
  const conv = await getConversation(db, userId, conversationId);
  if (!conv) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
}

export async function addMessage(
  db: DB,
  userId: string,
  conversationId: string,
  msg: {
    role: "user" | "assistant";
    text: string;
    result?: CaptionResult | Record<string, unknown> | null;
    mode?: GenerationMode | null;
    contextUsed?: TrendContextItem[] | null;
    sports?: SportsContextUsed | null;
    evidence?: EvidenceBundle | null;
  },
): Promise<Message | null> {
  const conv = await getConversation(db, userId, conversationId);
  if (!conv) return null;
  const rows = await db
    .insert(messages)
    .values({
      conversationId,
      role: msg.role,
      text: msg.text,
      result: (msg.result ?? null) as Record<string, unknown> | null,
      mode: msg.mode ?? null,
      contextUsed: msg.contextUsed ?? null,
      sports: msg.sports ?? null,
      evidence: msg.evidence ?? null,
    })
    .returning();
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  return rows[0];
}

// ---------- Saved caption variants ----------

export async function saveVariant(
  db: DB,
  userId: string,
  input: {
    conversationId: string | null;
    messageId: string | null;
    platform: string;
    label: string;
    originalText: string;
    text: string;
    hashtags: string[];
  },
): Promise<Variant | null> {
  if (input.conversationId) {
    const conv = await getConversation(db, userId, input.conversationId);
    if (!conv) return null;
  }
  const edited = input.text.trim() !== input.originalText.trim();
  const rows = await db.insert(captionVariants).values({ ...input, userId, edited }).returning();
  return rows[0];
}

export async function listVariants(db: DB, userId: string): Promise<Variant[]> {
  return db
    .select()
    .from(captionVariants)
    .where(eq(captionVariants.userId, userId))
    .orderBy(desc(captionVariants.updatedAt))
    .limit(200);
}

export async function getVariant(db: DB, userId: string, id: string): Promise<Variant | null> {
  const rows = await db
    .select()
    .from(captionVariants)
    .where(and(eq(captionVariants.id, id), eq(captionVariants.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateVariant(
  db: DB,
  userId: string,
  id: string,
  patch: { text?: string; hashtags?: string[] },
): Promise<Variant | null> {
  const existing = await getVariant(db, userId, id);
  if (!existing) return null;
  const text = patch.text ?? existing.text;
  const rows = await db
    .update(captionVariants)
    .set({
      text,
      hashtags: patch.hashtags ?? existing.hashtags,
      edited: text.trim() !== existing.originalText.trim() || existing.edited,
      updatedAt: new Date(),
    })
    .where(and(eq(captionVariants.id, id), eq(captionVariants.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteVariant(db: DB, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(captionVariants)
    .where(and(eq(captionVariants.id, id), eq(captionVariants.userId, userId)))
    .returning({ id: captionVariants.id });
  return rows.length > 0;
}
