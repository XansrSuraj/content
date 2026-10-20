import { describe, expect, it, vi } from "vitest";
import { OpenAICompatCaptionProvider, type OpenAICompatSettings } from "@/lib/providers/ai/openai-compatible";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import { aiStatus, readConfig } from "@/lib/config";
import { sampleResult } from "./fixtures";

const settings: OpenAICompatSettings = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "gsk_test",
  model: "openai/gpt-oss-20b",
  hostLabel: "Groq",
  timeoutMs: 2000,
  maxOutputTokens: 3000,
  jsonMode: "json_schema",
  reasoningEffort: "low",
};
const req = { context: DEFAULT_CONTEXT, originalInput: "Budget phone review", message: "Budget phone review", history: [], creator: null, evidenceNotes: [] };

const completion = (content: string, finish = "stop") =>
  new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 700, completion_tokens: 400 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

type Fetch = (u: string, i: RequestInit) => Promise<Response>;

describe("OpenAI-compatible open-model provider (Groq default)", () => {
  it("sends strict JSON-schema output, bearer auth and low reasoning effort; returns validated output", async () => {
    const fetchMock = vi.fn<Fetch>(async () => completion(JSON.stringify(sampleResult())));
    const out = await new OpenAICompatCaptionProvider(settings, fetchMock).generate(req);
    expect(out.mode).toBe("open_model");
    expect(out.usage).toEqual({ inputTokens: 700, outputTokens: 400, model: "openai/gpt-oss-20b" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk_test");
    const body = JSON.parse(String(init.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.reasoning_effort).toBe("low");
    expect(body.messages[1].content).toContain("<creator_message>");
    expect(body.messages[0].content).not.toContain("Budget phone review");
  });

  it("json_object mode puts the schema in the prompt instead", async () => {
    const fetchMock = vi.fn<Fetch>(async () => completion(JSON.stringify(sampleResult())));
    await new OpenAICompatCaptionProvider({ ...settings, jsonMode: "json_object", reasoningEffort: null }, fetchMock).generate(req);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages[1].content).toContain("JSON schema:");
  });

  it("repairs once after invalid output or a host-side schema rejection", async () => {
    const bad = { ...sampleResult(), variants: sampleResult().variants.slice(0, 1) };
    const f1 = vi.fn<Fetch>().mockResolvedValueOnce(completion(JSON.stringify(bad))).mockResolvedValueOnce(completion(JSON.stringify(sampleResult())));
    expect((await new OpenAICompatCaptionProvider(settings, f1).generate(req)).data.variants).toHaveLength(3);
    expect(f1).toHaveBeenCalledTimes(2);

    const f2 = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Generated JSON does not match the expected schema" } }), { status: 400 }))
      .mockResolvedValueOnce(completion(JSON.stringify(sampleResult())));
    expect((await new OpenAICompatCaptionProvider(settings, f2).generate(req)).data.variants).toHaveLength(3);
  });

  it("maps auth, rate-limit, missing-model, network and timeout errors", async () => {
    const run = (f: Fetch) => new OpenAICompatCaptionProvider(settings, f).generate(req).catch((e) => e);
    expect(await run(async () => new Response("no", { status: 401 }))).toMatchObject({ code: "auth_error", retryable: false });
    expect(await run(async () => new Response("slow down", { status: 429 }))).toMatchObject({ code: "upstream_rate_limited", retryable: true });
    expect(await run(async () => new Response("nope", { status: 404 }))).toMatchObject({ code: "upstream_error", retryable: false });
    expect(await run(async () => new Response("boom", { status: 503 }))).toMatchObject({ code: "upstream_error", retryable: true });
    expect(
      await run(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toMatchObject({ code: "upstream_error", retryable: true });
    expect(
      await run(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    ).toMatchObject({ code: "timeout", retryable: true });
  });

  it("returns invalid_output after the repair also fails (no template fallback)", async () => {
    const f = vi.fn<Fetch>(async () => completion("not json at all"));
    await expect(new OpenAICompatCaptionProvider(settings, f).generate(req)).rejects.toMatchObject({ code: "invalid_output" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("AI_PROVIDER=openai_compatible / groq configuration", () => {
  const env = (e: Record<string, string>) => readConfig(e as unknown as NodeJS.ProcessEnv);

  it("defaults to Groq + gpt-oss-20b and requires a key for remote hosts", () => {
    expect(aiStatus(env({ AI_PROVIDER: "groq" }))).toEqual({ kind: "not_configured", missing: ["OPENAI_COMPAT_API_KEY"] });
    expect(aiStatus(env({ AI_PROVIDER: "groq", OPENAI_COMPAT_API_KEY: "gsk_x" }))).toEqual({ kind: "open", model: "openai/gpt-oss-20b", host: "Groq" });
    expect(env({ AI_PROVIDER: "groq" }).openCompat.reasoningEffort).toBe("low");
  });

  it("allows a keyless local OpenAI-compatible server (vLLM / Ollama /v1)", () => {
    expect(aiStatus(env({ AI_PROVIDER: "openai_compatible", OPENAI_COMPAT_BASE_URL: "http://localhost:11434/v1", OPENAI_COMPAT_MODEL: "llama3.2:3b" }))).toEqual({
      kind: "open",
      model: "llama3.2:3b",
      host: "localhost",
    });
  });
});
