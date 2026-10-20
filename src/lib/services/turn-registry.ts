import "server-only";

/**
 * In-flight caption turns, so Stop works even when a proxy (e.g. Render) doesn't
 * forward the browser's disconnect. Process-local: correct for a single instance;
 * with several instances, a cancel may reach a different one (the turn then just
 * completes normally).
 */
interface Entry {
  userId: string;
  controller: AbortController;
  saved?: { conversationId: string; messageIds: string[]; createdConversation: boolean };
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { __tsTurns?: Map<string, Entry> };
const turns: Map<string, Entry> = (g.__tsTurns ??= new Map());

function sweep(now = Date.now()) {
  for (const [id, e] of turns) if (e.expiresAt < now) turns.delete(id);
}

export function registerTurn(turnId: string, userId: string): AbortController {
  sweep();
  const early = turns.get(turnId);
  // Stop arrived before the turn started: start it already cancelled.
  if (early && early.userId === userId && early.controller.signal.aborted) return early.controller;
  const controller = new AbortController();
  turns.set(turnId, { userId, controller, expiresAt: Date.now() + TTL_MS });
  return controller;
}

export function markTurnSaved(turnId: string, saved: NonNullable<Entry["saved"]>) {
  const e = turns.get(turnId);
  if (e) e.saved = saved;
}

/** Aborts the turn if it belongs to this user. Returns what was already saved, if anything. */
export function cancelTurn(turnId: string, userId: string): { found: boolean; saved?: Entry["saved"] } {
  const e = turns.get(turnId);
  if (!e) {
    // Remember the cancel briefly in case the turn request is still on its way.
    const controller = new AbortController();
    controller.abort();
    turns.set(turnId, { userId, controller, expiresAt: Date.now() + 60_000 });
    return { found: false };
  }
  if (e.userId !== userId) return { found: false };
  e.controller.abort();
  turns.delete(turnId);
  return { found: true, saved: e.saved };
}

export function finishTurn(turnId: string) {
  const e = turns.get(turnId);
  // Keep briefly so a Stop that races the final response can still undo the save.
  if (e) e.expiresAt = Date.now() + 30_000;
}
