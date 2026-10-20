import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnthropicCaptionProvider } from "@/lib/providers/ai/anthropic";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import { sampleModelOutput } from "./fixtures";

/**
 * Exercises the real SDK request/parse path against a local fake Messages API,
 * so the wire format (structured output schema, beta header, fallbacks) is
 * verified without network access or credentials.
 */
describe("Anthropic adapter wire format", () => {
  let server: http.Server;
  let baseURL = "";
  const seen: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
  let reply: (body: Record<string, unknown>) => { status: number; json: unknown } = () => ({ status: 500, json: {} });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        seen.push({ headers: req.headers, body });
        const r = reply(body);
        res.writeHead(r.status, { "content-type": "application/json", "request-id": "req_test" });
        res.end(JSON.stringify(r.json));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const settings = { apiKey: "sk-ant-test", model: "claude-test-model", timeoutMs: 5000, maxOutputTokens: 4000, effort: "low" as const, fallbacks: "default" as const };
  const req = { context: DEFAULT_CONTEXT, originalInput: "Budget phone se cinematic video", message: "Budget phone se cinematic video", history: [], creator: null, evidenceNotes: [] };

  it("sends a structured-output request and parses a JSON response", async () => {
    reply = () => ({
      status: 200,
      json: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-test-model",
        content: [{ type: "text", text: JSON.stringify(sampleModelOutput()) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 400, cache_read_input_tokens: 100 },
      },
    });
    const client = new Anthropic({ apiKey: settings.apiKey, baseURL, maxRetries: 0 });
    const out = await new AnthropicCaptionProvider(settings, client).generate(req);

    expect(out.mode).toBe("live_ai");
    expect(out.data.variants).toHaveLength(3);
    expect(out.usage).toEqual({ inputTokens: 1000, outputTokens: 400, model: "claude-test-model" });

    const sent = seen.at(-1)!;
    expect(sent.headers["x-api-key"]).toBe("sk-ant-test");
    expect(String(sent.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(sent.body.model).toBe("claude-test-model");
    expect(sent.body.fallbacks).toBe("default");
    const oc = sent.body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
    expect(oc.effort).toBe("low");
    expect(oc.format.type).toBe("json_schema");
    expect(Object.keys(oc.format.schema.properties)).toEqual(
      expect.arrayContaining(["topicSummary", "platforms", "hashtagSuggestions", "limitations"]),
    );
    // The model is never asked to assert trend status.
    expect(JSON.stringify(oc.format.schema)).not.toMatch(/trending|isTrending|trendStatus/i);
    // Untrusted creator text is wrapped as data in the user turn, not the system prompt.
    const system = JSON.stringify(sent.body.system);
    expect(system).not.toContain("Budget phone");
    expect(JSON.stringify(sent.body.messages)).toContain("<creator_message>");
  });

  it("surfaces upstream 529/500 errors as recoverable provider errors", async () => {
    reply = () => ({ status: 529, json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } });
    const client = new Anthropic({ apiKey: settings.apiKey, baseURL, maxRetries: 0 });
    await expect(new AnthropicCaptionProvider(settings, client).generate(req)).rejects.toMatchObject({ code: "upstream_error", retryable: true });
  });

  it("maps a bad model id (404) to a non-retryable configuration error", async () => {
    reply = () => ({ status: 404, json: { type: "error", error: { type: "not_found_error", message: "model not found" } } });
    const client = new Anthropic({ apiKey: settings.apiKey, baseURL, maxRetries: 0 });
    await expect(new AnthropicCaptionProvider(settings, client).generate(req)).rejects.toMatchObject({ code: "upstream_error", retryable: false });
  });

  it("omits fallbacks and effort when configured off", async () => {
    reply = () => ({
      status: 200,
      json: { id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text: JSON.stringify(sampleModelOutput()) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
    });
    const client = new Anthropic({ apiKey: settings.apiKey, baseURL, maxRetries: 0 });
    await new AnthropicCaptionProvider({ ...settings, fallbacks: "off", effort: null }, client).generate(req);
    const sent = seen.at(-1)!;
    expect(sent.body.fallbacks).toBeUndefined();
    expect((sent.body.output_config as Record<string, unknown>).effort).toBeUndefined();
  });
});
