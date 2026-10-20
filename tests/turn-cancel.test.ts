import { describe, expect, it } from "vitest";
import { cancelTurn, finishTurn, markTurnSaved, registerTurn } from "@/lib/services/turn-registry";
import { createTestDb, createUser } from "./helpers";
import { runCaptionTurn } from "@/lib/services/captions";
import { listConversations } from "@/lib/repo/studio";
import type { CaptionProvider } from "@/lib/providers/ai/types";
import { sampleResult } from "./fixtures";

describe("Stop / cancel registry", () => {
  it("aborts an in-flight turn for its owner only", () => {
    const c = registerTurn("turn-aaaa-1111", "user-a");
    expect(cancelTurn("turn-aaaa-1111", "user-b").found).toBe(false);
    expect(c.signal.aborted).toBe(false);
    expect(cancelTurn("turn-aaaa-1111", "user-a").found).toBe(true);
    expect(c.signal.aborted).toBe(true);
  });

  it("a cancel that arrives before the turn starts still wins", () => {
    cancelTurn("turn-early-2222", "user-a");
    expect(registerTurn("turn-early-2222", "user-a").signal.aborted).toBe(true);
  });

  it("returns what was saved so it can be undone", () => {
    registerTurn("turn-saved-3333", "user-a");
    markTurnSaved("turn-saved-3333", { conversationId: "c1", messageIds: ["m1", "m2"], createdConversation: true });
    finishTurn("turn-saved-3333");
    expect(cancelTurn("turn-saved-3333", "user-a").saved).toEqual({ conversationId: "c1", messageIds: ["m1", "m2"], createdConversation: true });
  });

  it("a stopped turn saves nothing", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "stop@example.com");
    const controller = new AbortController();
    const slow: CaptionProvider = {
      name: "fake",
      generate: async () => {
        controller.abort(); // creator presses Stop while the model is working
        return { data: sampleResult(), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "hi", opportunityId: null }, slow, { signal: controller.signal });
    expect(res).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(await listConversations(db, user.id)).toEqual([]);
  });
});
