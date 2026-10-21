import { z } from "zod";
import { CaptionFromModelSchema, CaptionModelOutputSchema, type CaptionResult } from "@/lib/domain/captions";
import { BriefContentSchema, BriefModelOutputSchema, type BriefContent } from "@/lib/domain/briefs";
import { BRIEF_SYSTEM_PROMPT, CAPTION_SYSTEM_PROMPT, buildBriefUserPrompt, buildCaptionUserPrompt } from "./prompts";
import { extractJson, jsonSchemaFor } from "./ollama";
import {
  ProviderError,
  type BriefProvider,
  type BriefProviderRequest,
  type CaptionProvider,
  type CaptionRequest,
  type ProviderOutput,
} from "./types";

/**
 * Open-weight models behind any OpenAI-compatible Chat Completions endpoint:
 * Groq (default — free tier, very fast), OpenRouter, Together, a self-hosted
 * vLLM server, or Ollama's /v1 endpoint. Uses JSON-schema structured output when
 * the host supports it, the same strict zod validation as every provider, one
 * repair attempt, and typed recoverable errors. Never falls back to the template.
 */

export interface OpenAICompatSettings {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  /** Shown in the UI, e.g. "Groq". */
  hostLabel: string;
  timeoutMs: number;
  maxOutputTokens: number;
  jsonMode: "json_schema" | "json_object";
  /** For reasoning models such as gpt-oss ("low" keeps captions fast). null = don't send. */
  reasoningEffort: "low" | "medium" | "high" | null;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const CompletionResponse = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Longest wait for a short rate-limit window before giving up (a caption should not hang). */
export const MAX_RATE_LIMIT_WAIT_MS = 20_000;

/** Wait from Retry-After (seconds) or the host's "try again in 4.8s / 682.5ms"; null when unknown. */
export function rateLimitWaitMs(retryAfter: string | null, reason: string): number | null {
  const header = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(header) && header >= 0) return header * 1000;
  const m = /try again in ((?:\d+m)?)([\d.]+)(ms|s)\b/i.exec(reason);
  if (!m) return null;
  const mins = m[1] ? Number(m[1].slice(0, -1)) : 0;
  return mins * 60_000 + Number(m[2]) * (m[3].toLowerCase() === "ms" ? 1 : 1000);
}

function abortableSleep(ms: number, cancel?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    cancel?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}

async function complete(
  s: OpenAICompatSettings,
  fetchImpl: FetchLike,
  messages: Msg[],
  schemaName: string,
  schema: Record<string, unknown>,
  cancel?: AbortSignal,
  retried = false,
): Promise<{ content: string; inputTokens: number; outputTokens: number; model: string; truncated: boolean }> {
  const body: Record<string, unknown> = {
    model: s.model,
    messages,
    temperature: 0.6,
    max_tokens: s.maxOutputTokens,
    response_format:
      s.jsonMode === "json_schema" ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } : { type: "json_object" },
  };
  if (s.reasoningEffort) body.reasoning_effort = s.reasoningEffort;

  let res: Response;
  try {
    res = await fetchImpl(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: cancel ? AbortSignal.any([AbortSignal.timeout(s.timeoutMs), cancel]) : AbortSignal.timeout(s.timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (cancel?.aborted) throw new ProviderError("cancelled", "Stopped.", false);
    if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("timeout", `${s.hostLabel} took too long to respond.`, true);
    throw new ProviderError("upstream_error", `Could not reach ${s.hostLabel}. Check the internet connection and retry.`, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth_error", `${s.hostLabel} rejected the server's API key.`, false);
    if (res.status === 429) {
      // The host's reason (which limit, retry time) — never request content or account ids.
      let reason = "";
      try {
        reason = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 240) ?? "";
      } catch {
        /* not JSON */
      }
      console.warn(`[openai-compatible] rate limited: ${reason.replace(/org_\w+/g, "org_***") || "no reason given"}`);
      // A per-minute token window frees up within seconds: wait once if the host says it is short.
      const waitMs = rateLimitWaitMs(res.headers.get("retry-after"), reason);
      if (!retried && waitMs !== null && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
        await abortableSleep(waitMs + 250, cancel);
        if (cancel?.aborted) throw new ProviderError("cancelled", "Stopped.", false);
        return complete(s, fetchImpl, messages, schemaName, schema, cancel, true);
      }
    }
    if (res.status === 429) throw new ProviderError("upstream_rate_limited", `${s.hostLabel} free-tier limit reached. Try again in a minute.`, true);
    if (res.status === 404) throw new ProviderError("upstream_error", `${s.hostLabel} does not offer the model "${s.model}".`, false);
    // Some hosts reject a reply that broke the schema with a 400 — that is worth one repair.
    if (res.status === 400 && /schema|json/i.test(text)) {
      // Groq returns the rejected reply as `failed_generation`: validate and repair it ourselves.
      let failed = "";
      let code = "";
      try {
        const e = (JSON.parse(text) as { error?: { code?: string; failed_generation?: string } }).error;
        failed = e?.failed_generation ?? "";
        code = e?.code ?? "";
      } catch {
        /* not JSON */
      }
      console.warn(`[openai-compatible] host rejected the reply (${code || "schema"}); ${failed ? "repairing it" : "no reply to repair"}`);
      return { content: failed, inputTokens: 0, outputTokens: 0, model: s.model, truncated: false };
    }
    throw new ProviderError("upstream_error", `${s.hostLabel} returned an error (HTTP ${res.status}).`, res.status >= 500);
  }

  const parsed = CompletionResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ProviderError("invalid_output", `${s.hostLabel} returned an unexpected response.`, true);
  const choice = parsed.data.choices[0];
  return {
    content: choice.message.content ?? "",
    inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
    outputTokens: parsed.data.usage?.completion_tokens ?? 0,
    model: parsed.data.model ?? s.model,
    truncated: choice.finish_reason === "length",
  };
}

async function structured<T>(
  s: OpenAICompatSettings,
  fetchImpl: FetchLike,
  system: string,
  user: string,
  schemaName: string,
  modelSchema: z.ZodType,
  strict: z.ZodType<T>,
  cancel?: AbortSignal,
) {
  const schema = jsonSchemaFor(modelSchema);
  const messages: Msg[] = [
    { role: "system", content: `${system}\n\nReply with one JSON object only.` },
    // json_object mode needs the schema in the prompt; json_schema mode enforces it on the host.
    { role: "user", content: s.jsonMode === "json_object" ? `${user}\n\nJSON schema:\n${JSON.stringify(schema)}` : user },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await complete(s, fetchImpl, messages, schemaName, schema, cancel);
    inputTokens += out.inputTokens;
    outputTokens += out.outputTokens;
    const json = extractJson(out.content);
    const checked = json === undefined ? null : strict.safeParse(json);
    if (checked?.success) return { data: checked.data, inputTokens, outputTokens, model: out.model };
    const issues = checked && !checked.success ? checked.error.issues.slice(0, 8).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n") : "- The reply was not valid JSON.";
    // Field paths and rule names only — never caption content.
    console.warn(`[openai-compatible] attempt ${attempt} failed validation (${out.truncated ? "truncated" : "invalid"}): ${issues.split("\n").slice(0, 3).join(" | ")}`);
    messages.push(
      { role: "assistant", content: out.content.slice(0, 12_000) || "(no content)" },
      { role: "user", content: `Your reply did not pass validation:\n${out.truncated ? "- It was cut off. Be more concise.\n" : ""}${issues}\nReturn the corrected JSON object only.` },
    );
  }
  throw new ProviderError("invalid_output", "The AI returned invalid output twice. Please retry.", true);
}

export class OpenAICompatCaptionProvider implements CaptionProvider {
  readonly name = "openai_compatible";
  constructor(
    private settings: OpenAICompatSettings,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async generate(req: CaptionRequest): Promise<ProviderOutput<CaptionResult>> {
    const out = await structured(this.settings, this.fetchImpl, CAPTION_SYSTEM_PROMPT, buildCaptionUserPrompt(req), "caption_result", CaptionModelOutputSchema, CaptionFromModelSchema, req.signal);
    return { data: out.data, mode: "open_model", usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model } };
  }
}

export class OpenAICompatBriefProvider implements BriefProvider {
  readonly name = "openai_compatible";
  constructor(
    private settings: OpenAICompatSettings,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async generate(req: BriefProviderRequest): Promise<ProviderOutput<Omit<BriefContent, "sourceRefs">>> {
    const out = await structured(
      this.settings,
      this.fetchImpl,
      BRIEF_SYSTEM_PROMPT,
      buildBriefUserPrompt(req),
      "content_brief",
      BriefModelOutputSchema,
      BriefContentSchema.omit({ sourceRefs: true }),
    );
    return { data: out.data, mode: "open_model", usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model } };
  }
}
