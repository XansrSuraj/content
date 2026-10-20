import { getDb } from "@/lib/db/client";
import { apiError, json, mutation } from "@/lib/api";
import { CaptionTurnSchema, hashtagStatusesFor, runCaptionTurn } from "@/lib/services/captions";
import { toClientMessage } from "@/lib/services/serialize";

export const maxDuration = 90;

export const POST = mutation(CaptionTurnSchema, async (user, body) => {
  const db = await getDb();
  const res = await runCaptionTurn(db, user, body);
  if (!res.ok) {
    const e = res.error;
    switch (e.kind) {
      case "validation":
        return apiError(400, "invalid", e.message);
      case "not_found":
        return apiError(404, "not_found", "Conversation not found.");
      case "quota":
        return apiError(429, "quota", e.message, { retryAfterSeconds: e.retryAfterSeconds });
      case "provider":
        return apiError(e.code === "auth_error" ? 503 : 502, e.code, e.message, { retryable: e.retryable });
    }
  }
  const { value } = res;
  const result = toClientMessage(value.assistantMessage).result;
  const statuses = result ? await hashtagStatusesFor(db, user, result, value.context.platform) : [];
  return json({
    conversationId: value.conversationId,
    context: value.context,
    applied: value.applied,
    userMessage: toClientMessage(value.userMessage),
    assistantMessage: toClientMessage(value.assistantMessage, statuses),
  });
}, 40_000);
