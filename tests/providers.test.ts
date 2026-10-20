import Anthropic from "@anthropic-ai/sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AnthropicCaptionProvider, mapError, type ParseClient } from "@/lib/providers/ai/anthropic";
import { ProviderError, type CaptionProvider } from "@/lib/providers/ai/types";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import { createTestDb, createUser } from "./helpers";
import type { DB } from "@/lib/db/client";
import { runCaptionTurn } from "@/lib/services/captions";
import { listConversations } from "@/lib/repo/studio";
import { usageRecords } from "@/lib/db/schema";
import { sampleResult } from "./fixtures";

const settings = { apiKey: "test", model: "test-model", timeoutMs: 1000, maxOutputTokens: 1000, effort: "low" as const, fallbacks: "off" as const };
const req = { context: DEFAULT_CONTEXT, originalInput: "x", message: "x", history: [], creator: null, evidenceNotes: [] };

function fakeClient(impl: () => Promise<unknown>): ParseClient {
  return { beta: { messages: { parse: vi.fn(impl) as unknown as ParseClient["beta"]["messages"]["parse"] } } };
}

function ok(parsed: unknown, stop = "end_turn") {
  return async () => ({ stop_reason: stop, parsed_output: parsed, model: "test-model", usage: { input_tokens: 10, output_tokens: 20 } });
}

describe("Anthropic caption provider", () => {
  it("returns validated live output with usage", async () => {
    const p = new AnthropicCaptionProvider(settings, fakeClient(ok(sampleResult())));
    const out = await p.generate(req);
    expect(out.mode).toBe("live_ai");
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 20, model: "test-model" });
  });

  it("rejects model output that fails business validation", async () => {
    const bad = { ...sampleResult(), variants: sampleResult().variants.slice(0, 1) };
    const p = new AnthropicCaptionProvider(settings, fakeClient(ok(bad)));
    await expect(p.generate(req)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps refusals, truncation and missing parse to recoverable provider errors", async () => {
    await expect(new AnthropicCaptionProvider(settings, fakeClient(ok(null, "refusal"))).generate(req)).rejects.toMatchObject({ code: "refusal" });
    await expect(new AnthropicCaptionProvider(settings, fakeClient(ok(null, "max_tokens"))).generate(req)).rejects.toMatchObject({ code: "invalid_output" });
    await expect(new AnthropicCaptionProvider(settings, fakeClient(ok(null))).generate(req)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps SDK timeout and rate-limit errors", async () => {
    const timeout = new Anthropic.APIConnectionTimeoutError();
    await expect(
      new AnthropicCaptionProvider(settings, fakeClient(async () => { throw timeout; })).generate(req),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
    expect(mapError(new Anthropic.APIUserAbortError()).code).toBe("timeout");
    const rl = new Anthropic.RateLimitError(429, { type: "error" }, "rate", new Headers());
    expect(mapError(rl).code).toBe("upstream_rate_limited");
    const auth = new Anthropic.AuthenticationError(401, { type: "error" }, "auth", new Headers());
    expect(mapError(auth)).toMatchObject({ code: "auth_error", retryable: false });
  });
});

describe("caption turn with a failing provider", () => {
  let db: DB;
  beforeAll(async () => {
    db = await createTestDb();
    vi.stubEnv("DATABASE_URL", "memory://");
  });

  it("returns a recoverable error, records usage, and saves no partial conversation", async () => {
    const user = await createUser(db, "fail@example.com");
    const failing: CaptionProvider = {
      name: "anthropic",
      generate: async () => {
        throw new ProviderError("timeout", "The AI provider took too long to respond.", true);
      },
    };
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "Mera caption", opportunityId: null }, failing);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatchObject({ kind: "provider", code: "timeout", retryable: true });
    expect(await listConversations(db, user.id)).toEqual([]);
    const usage = await db.select().from(usageRecords);
    expect(usage.some((u) => u.userId === user.id && u.status === "error" && u.errorCode === "timeout")).toBe(true);
  });

  it("succeeds with a working provider and persists both messages", async () => {
    const user = await createUser(db, "ok@example.com");
    const working: CaptionProvider = {
      name: "fake",
      generate: async () => ({ data: sampleResult(), mode: "live_ai", usage: { inputTokens: 1, outputTokens: 1, model: "m" } }),
    };
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "Mera caption", opportunityId: null }, working);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.assistantMessage.mode).toBe("live_ai");
      // Follow-up preserves the conversation and applies constraints.
      const res2 = await runCaptionTurn(db, user, { conversationId: res.value.conversationId, message: "Emoji hata do", opportunityId: null }, working);
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.value.context.emoji).toBe("none");
        const result = res2.value.assistantMessage.result as { variants: { caption: string }[] };
        expect(result.variants.every((v) => !/\p{Extended_Pictographic}/u.test(v.caption))).toBe(true);
      }
    }
  });

  it("rejects access to another user's conversation", async () => {
    const owner = await createUser(db, "owner@example.com");
    const intruder = await createUser(db, "intruder@example.com");
    const working: CaptionProvider = {
      name: "fake",
      generate: async () => ({ data: sampleResult(), mode: "live_ai", usage: { inputTokens: 1, outputTokens: 1, model: "m" } }),
    };
    const first = await runCaptionTurn(db, owner, { conversationId: null, message: "hi", opportunityId: null }, working);
    if (!first.ok) throw new Error("setup failed");
    const res = await runCaptionTurn(db, intruder, { conversationId: first.value.conversationId, message: "x", opportunityId: null }, working);
    expect(res).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("unmet follow-up requests are reported, not hidden", () => {
  it("flags 'shorter' when the new options are not shorter", async () => {
    const { flagUnmetRequests } = await import("@/lib/services/captions");
    const prev = { id: "m1", conversationId: "c", role: "assistant" as const, text: "", result: sampleResult() as unknown as Record<string, unknown>, mode: "local_ai" as const, contextUsed: null, sports: null, evidence: null, createdAt: new Date() };
    const same = flagUnmetRequests(sampleResult(), ["Length: short"], [prev]);
    expect(same.limitations.join(" ")).toMatch(/not shorter/);
    const shorter = sampleResult({ variants: sampleResult().variants.map((v) => ({ ...v, caption: "Chhota." })) });
    expect(flagUnmetRequests(shorter, ["Length: short"], [prev]).limitations).toEqual([]);
    expect(flagUnmetRequests(sampleResult(), [], [prev]).limitations).toEqual([]);
  });
});
