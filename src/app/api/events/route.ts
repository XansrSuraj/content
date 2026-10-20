import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiError, json, mutation } from "@/lib/api";
import { recordEvent } from "@/lib/repo/creator";
import { messageOwnedBy } from "@/lib/repo/studio";
import { PLATFORM_IDS } from "@/lib/domain/platforms";
import { OPTION_KINDS } from "@/lib/domain/captions";

const ClientEvent = z.object({
  type: z.enum(["recommended_copied", "hashtags_copied", "caption_edited", "marked_useful", "marked_not_useful"]),
  messageId: z.string().max(64),
  platform: z.enum(PLATFORM_IDS).optional(),
  kind: z.enum(OPTION_KINDS).optional(),
  field: z.enum(["title", "description", "caption", "hashtags", "all"]).optional(),
});

/** Creator actions on an answer. Ids and enums only — never caption text. */
export const POST = mutation(
  ClientEvent,
  async (user, body) => {
    const db = await getDb();
    if (!(await messageOwnedBy(db, user.id, body.messageId))) return apiError(404, "not_found", "Answer not found.");
    await recordEvent(db, user.id, body.type, {
      messageId: body.messageId,
      platform: body.platform ?? null,
      kind: body.kind ?? null,
      field: body.field ?? null,
    });
    return json({ ok: true });
  },
  2_000,
);
