import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiError, json, mutation } from "@/lib/api";
import { PLATFORM_IDS } from "@/lib/domain/platforms";
import { dedupeHashtags } from "@/lib/domain/hashtags";
import { recordEvent } from "@/lib/repo/creator";
import { listMessages, saveVariant } from "@/lib/repo/studio";
import { saveItem } from "@/lib/repo/work";
import { CaptionResultSchema } from "@/lib/domain/captions";

const SaveVariant = z.object({
  conversationId: z.string().max(64),
  messageId: z.string().max(64),
  variantId: z.enum(["A", "B", "C"]),
  platform: z.enum(PLATFORM_IDS),
  text: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().max(60)).max(30),
});

/** Saves a selected (optionally edited) caption variant. The original text is read server-side. */
export const POST = mutation(SaveVariant, async (user, body) => {
  const db = await getDb();
  const msgs = await listMessages(db, user.id, body.conversationId);
  const msg = msgs.find((m) => m.id === body.messageId && m.role === "assistant");
  if (!msg) return apiError(404, "not_found", "Caption not found.");
  const result = CaptionResultSchema.safeParse(msg.result);
  const original = result.success ? result.data.variants.find((v) => v.id === body.variantId) : undefined;
  if (!original) return apiError(404, "not_found", "Caption option not found.");

  const variant = await saveVariant(db, user.id, {
    conversationId: body.conversationId,
    messageId: body.messageId,
    platform: body.platform,
    label: `Option ${body.variantId} · ${original.approach}`,
    originalText: original.caption,
    text: body.text,
    hashtags: dedupeHashtags(body.hashtags),
  });
  if (!variant) return apiError(404, "not_found", "Conversation not found.");
  await saveItem(db, user.id, "variant", variant.id);
  await recordEvent(db, user.id, "caption_selected", { variantId: variant.id, option: body.variantId, mode: msg.mode });
  if (variant.edited) await recordEvent(db, user.id, "output_edited", { target: "variant", variantId: variant.id });
  return json({ id: variant.id, edited: variant.edited });
});
