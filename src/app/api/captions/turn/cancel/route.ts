import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { json, mutation } from "@/lib/api";
import { deleteConversation, deleteMessages, listMessages } from "@/lib/repo/studio";
import { cancelTurn } from "@/lib/services/turn-registry";

const Cancel = z.object({ turnId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) });

/** Stop button: aborts an in-flight turn; if it had already been saved, removes it so Stop means "nothing kept". */
export const POST = mutation(Cancel, async (user, body) => {
  const res = cancelTurn(body.turnId, user.id);
  let removed = 0;
  if (res.saved) {
    const db = await getDb();
    removed = await deleteMessages(db, user.id, res.saved.conversationId, res.saved.messageIds);
    if (res.saved.createdConversation && (await listMessages(db, user.id, res.saved.conversationId)).length === 0) {
      await deleteConversation(db, user.id, res.saved.conversationId);
    }
  }
  return json({ cancelled: res.found, removed });
});
