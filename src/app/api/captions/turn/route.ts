import { getDb } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { apiError, json, mutation } from "@/lib/api";
import { CaptionTurnSchema, hashtagStatusesFor, runCaptionTurn, type CaptionTurnInput, type TurnError } from "@/lib/services/captions";
import { toClientMessage } from "@/lib/services/serialize";
import { previewFromPartial } from "@/lib/providers/ai/ollama";
import { finishTurn, markTurnSaved, registerTurn } from "@/lib/services/turn-registry";

export const maxDuration = 300;

function errorPayload(e: TurnError): { status: number; body: { code: string; message: string; [k: string]: unknown } } {
  switch (e.kind) {
    case "validation":
      return { status: 400, body: { code: "invalid", message: e.message } };
    case "not_found":
      return { status: 404, body: { code: "not_found", message: "Conversation not found." } };
    case "quota":
      return { status: 429, body: { code: "quota", message: e.message, retryAfterSeconds: e.retryAfterSeconds } };
    case "provider":
      return {
        status: e.code === "auth_error" || e.code === "local_unavailable" ? 503 : 502,
        body: { code: e.code, message: e.message, retryable: e.retryable },
      };
  }
}

async function runTurn(
  user: SessionUser,
  body: CaptionTurnInput,
  onProgress?: (p: { tokens: number; text: string }) => void,
  signal?: AbortSignal,
) {
  const db = await getDb();
  // Stop works through the explicit cancel endpoint too (proxies may not forward disconnects).
  const controller = body.turnId ? registerTurn(body.turnId, user.id) : null;
  const combined = controller ? (signal ? AbortSignal.any([signal, controller.signal]) : controller.signal) : signal;
  const res = await runCaptionTurn(db, user, body, undefined, { onProgress, signal: combined });
  if (!res.ok) {
    if (body.turnId) finishTurn(body.turnId);
    return { ok: false as const, ...errorPayload(res.error) };
  }
  const { value } = res;
  if (body.turnId) {
    markTurnSaved(body.turnId, {
      conversationId: value.conversationId,
      messageIds: [value.userMessage.id, value.assistantMessage.id],
      createdConversation: !body.conversationId,
    });
    finishTurn(body.turnId);
  }
  const result = toClientMessage(value.assistantMessage).result;
  const statuses = result ? await hashtagStatusesFor(db, user, result, value.context.platform) : [];
  return {
    ok: true as const,
    payload: {
      conversationId: value.conversationId,
      context: value.context,
      applied: value.applied,
      userMessage: toClientMessage(value.userMessage),
      assistantMessage: toClientMessage(value.assistantMessage, statuses),
    },
  };
}

/**
 * Default: one JSON response. With `Accept: application/x-ndjson` the response
 * streams `{"type":"progress"}` lines (token count + live preview of option A)
 * and ends with `{"type":"result"}` or `{"type":"error"}`.
 */
export const POST = mutation(
  CaptionTurnSchema,
  async (user, body, req) => {
    if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
      const out = await runTurn(user, body, undefined, req.signal);
      return out.ok ? json(out.payload) : apiError(out.status, out.body.code, out.body.message, out.body);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          // The client may have pressed Stop and closed the stream.
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch {
            /* stream already closed */
          }
        };
        let lastSent = 0;
        try {
          const out = await runTurn(user, body, ({ tokens, text }) => {
            const now = Date.now();
            if (now - lastSent < 400) return;
            lastSent = now;
            send({ type: "progress", tokens, preview: previewFromPartial(text).slice(0, 600) });
          }, req.signal);
          if (out.ok) send({ type: "result", ...out.payload });
          else send({ type: "error", status: out.status, error: out.body });
        } catch (err) {
          // Error type and stack only — request bodies (captions) are never logged.
          console.error("[captions/turn] unexpected error:", err instanceof Error ? err.stack ?? err.message : String(err));
          send({ type: "error", status: 500, error: { code: "server_error", message: "Something went wrong on the server. Please retry.", retryable: true } });
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  },
  40_000,
);
