import { describe, expect, it, vi } from "vitest";
import { OllamaBriefProvider, OllamaCaptionProvider, extractJson, type OllamaSettings } from "@/lib/providers/ai/ollama";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import { aiStatus, readConfig } from "@/lib/config";
import { sampleResult } from "./fixtures";

const settings: OllamaSettings = { baseUrl: "http://localhost:11434", model: "llama3.2:3b", timeoutMs: 2000, numCtx: 4096, maxOutputTokens: 512 };
const req = { context: DEFAULT_CONTEXT, originalInput: "Budget phone review", message: "Budget phone review", history: [], creator: null, evidenceNotes: [] };

function chatReply(content: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ model: "llama3.2:3b", message: { role: "assistant", content }, done: true, done_reason: "stop", prompt_eval_count: 100, eval_count: 50, ...extra }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Ollama provider", () => {
  it("sends a JSON-schema structured request and returns validated local output", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => chatReply(JSON.stringify(sampleResult())));
    const out = await new OllamaCaptionProvider(settings, fetchMock).generate(req);
    expect(out.mode).toBe("local_ai");
    expect(out.usage).toEqual({ inputTokens: 100, outputTokens: 50, model: "llama3.2:3b" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "llama3.2:3b", stream: true, options: { num_ctx: 4096, num_predict: 512 } });
    expect(body.format.type).toBe("object");
    expect(Object.keys(body.format.properties)).toContain("variants");
    expect(JSON.stringify(body.format)).not.toMatch(/trending/i);
    // Untrusted input stays in the user turn.
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).not.toContain("Budget phone review");
    expect(body.messages[1].content).toContain("<creator_message>");
  });

  it("repairs broken JSON once, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatReply('{"topicSummary": "x", "variants": [ oops'))
      .mockResolvedValueOnce(chatReply(JSON.stringify(sampleResult())));
    const out = await new OllamaCaptionProvider(settings, fetchMock).generate(req);
    expect(out.data.variants).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const last = repairBody.messages.at(-1);
    expect(last.role).toBe("user");
    expect(last.content).toMatch(/not valid JSON/);
    expect(repairBody.messages.at(-2).role).toBe("assistant");
    // Usage includes both attempts.
    expect(out.usage.inputTokens).toBe(200);
  });

  it("repairs schema violations (e.g. two options) using the validation errors", async () => {
    const two = { ...sampleResult(), variants: sampleResult().variants.slice(0, 2) };
    const fetchMock = vi.fn().mockResolvedValueOnce(chatReply(JSON.stringify(two))).mockResolvedValueOnce(chatReply(JSON.stringify(sampleResult())));
    await new OllamaCaptionProvider(settings, fetchMock).generate(req);
    const repair = JSON.parse(String(fetchMock.mock.calls[1][1].body)).messages.at(-1).content;
    expect(repair).toMatch(/variants/);
  });

  it("returns a recoverable invalid_output error after the repair also fails (no template fallback)", async () => {
    const fetchMock = vi.fn(async () => chatReply("I cannot answer in JSON, sorry!"));
    await expect(new OllamaCaptionProvider(settings, fetchMock).generate(req)).rejects.toMatchObject({ code: "invalid_output", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports Ollama not running as local_unavailable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" }) });
    });
    const err = await new OllamaCaptionProvider(settings, fetchMock).generate(req).catch((e) => e);
    expect(err).toMatchObject({ code: "local_unavailable", retryable: true });
    expect(err.message).toMatch(/not reachable at http:\/\/localhost:11434/);
  });

  it("reports a missing model with the pull command", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "model 'llama3.2:3b' not found" }), { status: 404 }));
    const err = await new OllamaCaptionProvider(settings, fetchMock).generate(req).catch((e) => e);
    expect(err).toMatchObject({ code: "local_unavailable", retryable: false });
    expect(err.message).toMatch(/ollama pull llama3\.2:3b/);
  });

  it("maps timeouts and server errors", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(new OllamaCaptionProvider(settings, timeout).generate(req)).rejects.toMatchObject({ code: "timeout", retryable: true });
    const boom = vi.fn(async () => new Response("oops", { status: 500 }));
    await expect(new OllamaCaptionProvider(settings, boom).generate(req)).rejects.toMatchObject({ code: "upstream_error", retryable: true });
  });

  it("brief provider uses the same strict validation", async () => {
    const fetchMock = vi.fn(async () => chatReply(JSON.stringify({ originalAngle: "" })));
    await expect(
      new OllamaBriefProvider(settings, fetchMock).generate({
        topic: "t",
        opportunityId: null,
        platform: "youtube",
        language: "hinglish",
        tone: "conversational",
        angle: "",
        availableMinutes: null,
        personalExample: "",
        creator: null,
        evidenceNotes: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope this helps')).toEqual({ a: 2 });
    expect(extractJson("nope")).toBeUndefined();
  });
});

describe("AI_PROVIDER configuration", () => {
  const env = (e: Record<string, string>) => readConfig(e as unknown as NodeJS.ProcessEnv);

  it("defaults keep the original behaviour", () => {
    expect(aiStatus(env({})).kind).toBe("not_configured");
    expect(aiStatus(env({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "m" })).kind).toBe("live");
  });

  it("ollama is selected explicitly with safe defaults", () => {
    expect(aiStatus(env({ AI_PROVIDER: "ollama" }))).toEqual({ kind: "local", model: "llama3.2:3b", baseUrl: "http://localhost:11434" });
    expect(aiStatus(env({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5:3b", OLLAMA_BASE_URL: "http://127.0.0.1:9999/" }))).toEqual({
      kind: "local",
      model: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:9999",
    });
    // A non-http base URL is ignored rather than used.
    expect(env({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "file:///etc" }).ollama.baseUrl).toBe("http://localhost:11434");
  });

  it("template can be forced, and invalid values are reported", () => {
    expect(aiStatus(env({ AI_PROVIDER: "template", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "m" }))).toMatchObject({ kind: "not_configured", missing: [] });
    expect(aiStatus(env({ AI_PROVIDER: "gpt" }))).toMatchObject({ kind: "not_configured" });
  });
});
