import { z } from "zod";
import { CaptionResultSchema, type CaptionResult } from "@/lib/domain/captions";
import { BriefContentSchema, BriefModelOutputSchema, type BriefContent } from "@/lib/domain/briefs";
import { BRIEF_SYSTEM_PROMPT, CAPTION_SYSTEM_PROMPT, buildBriefUserPrompt, buildCaptionUserPrompt } from "./prompts";
import {
  ProviderError,
  type BriefProvider,
  type BriefProviderRequest,
  type CaptionProvider,
  type CaptionRequest,
  type ProviderOutput,
} from "./types";

/**
 * Local development provider using Ollama's HTTP API (POST /api/chat with a
 * JSON-schema `format`). Output goes through the same strict validation as the
 * hosted provider. Small local models often break structure, so one repair
 * attempt is made before a recoverable error is returned. Never falls back to
 * the template provider.
 */

export interface OllamaSettings {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  numCtx: number;
  maxOutputTokens: number;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const ChatResponse = z.object({
  model: z.string().optional(),
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

/** Short end-of-prompt reminders for small local models (not used by the hosted provider). */
export const CAPTION_CHECKLIST = [
  "- Captions are in the creator's voice (\"maine…\", \"mera…\"), talking to viewers — not instructions to the creator.",
  "- If language is Hinglish: write Hindi sentences in Roman script with some natural English words — not plain English, and not copied from these instructions.",
  "- Options A, B and C each start with a different first line and use a different structure.",
  "- No hashtags inside caption text. No numbers, lists or facts that are not in the creator's text.",
  "- Apply the creator's latest message visibly (shorter, funnier, no emoji, locked first line…).",
].join("\n");

const JSON_ONLY =
  "\n\nOutput format: reply with one JSON object only, matching the schema in the request. No markdown, no code fences, no text before or after the JSON.";

export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** Tolerates code fences or chatter around the JSON object. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function describeIssues(err: z.ZodError | null, parseFailed: boolean): string {
  if (parseFailed) return "- The reply was not valid JSON.";
  return (err?.issues ?? [])
    .slice(0, 8)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export type ProgressFn = (p: { tokens: number; text: string }) => void;

function timeoutError(s: OllamaSettings) {
  return new ProviderError(
    "timeout",
    `The local model took longer than ${Math.round(s.timeoutMs / 1000)}s. Local models on CPU are slow — retry, or raise OLLAMA_TIMEOUT_MS.`,
    true,
  );
}

/** Reads Ollama's newline-delimited JSON stream (a single non-streamed object also works). */
async function readChatStream(res: Response, onProgress?: ProgressFn) {
  let content = "";
  let tokens = 0;
  let last: z.infer<typeof ChatResponse> | null = null;
  let buffer = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = ChatResponse.partial({ message: true }).safeParse(obj);
    if (!parsed.success) return;
    content += parsed.data.message?.content ?? "";
    tokens++;
    if ((obj as { done?: boolean }).done) last = { ...parsed.data, message: { content } };
    onProgress?.({ tokens, text: content });
  };
  const reader = res.body?.getReader();
  if (!reader) {
    (await res.text()).split("\n").forEach(handle);
  } else {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer + decoder.decode());
  }
  return { content, last: last as z.infer<typeof ChatResponse> | null };
}

async function chat(
  s: OllamaSettings,
  fetchImpl: FetchLike,
  messages: ChatMessage[],
  format: Record<string, unknown>,
  onProgress?: ProgressFn,
  cancel?: AbortSignal,
): Promise<{ content: string; inputTokens: number; outputTokens: number; model: string; truncated: boolean }> {
  let res: Response;
  const signal = cancel ? AbortSignal.any([AbortSignal.timeout(s.timeoutMs), cancel]) : AbortSignal.timeout(s.timeoutMs);
  try {
    res = await fetchImpl(`${s.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: s.model,
        messages,
        stream: true,
        format,
        // Keep the model in memory between requests so later captions skip loading.
        keep_alive: "30m",
        options: { temperature: 0.6, num_ctx: s.numCtx, num_predict: s.maxOutputTokens },
      }),
      signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (cancel?.aborted) throw new ProviderError("cancelled", "Stopped.", false);
    if (name === "TimeoutError" || name === "AbortError") throw timeoutError(s);
    throw new ProviderError(
      "local_unavailable",
      `Ollama is not reachable at ${s.baseUrl}. Start the Ollama app (or run "ollama serve"), then retry.`,
      true,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 || /not found/i.test(body)) {
      throw new ProviderError(
        "local_unavailable",
        `The model "${s.model}" is not installed in Ollama. Run: ollama pull ${s.model}`,
        false,
      );
    }
    throw new ProviderError("upstream_error", `Ollama returned an error (HTTP ${res.status}).`, res.status >= 500);
  }

  let streamed: Awaited<ReturnType<typeof readChatStream>>;
  try {
    streamed = await readChatStream(res, onProgress);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (cancel?.aborted) throw new ProviderError("cancelled", "Stopped.", false);
    if (name === "TimeoutError" || name === "AbortError" || signal.aborted) throw timeoutError(s);
    throw new ProviderError("upstream_error", "The connection to Ollama broke while it was writing.", true);
  }
  if (!streamed.last && !streamed.content) throw new ProviderError("invalid_output", "Ollama returned an unexpected response.", true);
  return {
    content: streamed.content,
    inputTokens: streamed.last?.prompt_eval_count ?? 0,
    outputTokens: streamed.last?.eval_count ?? 0,
    model: streamed.last?.model ?? s.model,
    truncated: streamed.last?.done_reason === "length",
  };
}

// ---------- Compact caption format for local models ----------

/**
 * Generation speed on CPU is ~8 tokens/s, so the local model only writes the
 * parts creators read first. The remaining CaptionResult fields are filled in
 * by code, and the whole result still goes through CaptionResultSchema.
 */
export const LocalCaptionSchema = z.object({
  topicSummary: z.string().describe("One short sentence."),
  variants: z
    .array(
      z.object({
        id: z.enum(["A", "B", "C"]),
        approach: z.string().describe("2-4 words naming the creative approach."),
        caption: z.string(),
        hashtags: z.array(z.string()),
      }),
    )
    .describe("Exactly three options."),
  recommendedVariantId: z.enum(["A", "B", "C"]),
  recommendationReason: z.string().describe("One sentence."),
  hooks: z.array(z.string()).describe("Three short opening lines."),
});

export function expandLocalCaption(local: z.infer<typeof LocalCaptionSchema>): unknown {
  const tags = new Map<string, string>();
  for (const v of local.variants) for (const t of v.hashtags) if (!tags.has(t.toLowerCase())) tags.set(t.toLowerCase(), t);
  return {
    topicSummary: local.topicSummary,
    assumptions: [],
    clarifyingQuestion: null,
    variants: local.variants,
    recommendedVariantId: local.recommendedVariantId,
    recommendationReason: local.recommendationReason,
    hooks: local.hooks.slice(0, 6),
    hashtagSuggestions: [...tags.values()].slice(0, 8).map((tag) => ({ tag, reason: "Used in the options above" })),
    keywords: [],
    improvements: [],
    limitations: ["Written by a small local model — check facts and wording before posting."],
    // The local model only writes the main options; per-platform versions need the hosted model.
    platformVersions: [],
  };
}

const LocalCaptionStrict = LocalCaptionSchema.transform(expandLocalCaption).pipe(CaptionResultSchema);

/** Reads the first caption text out of a partially streamed JSON reply (for live preview). */
export function previewFromPartial(text: string): string {
  const m = text.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return "";
  return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function structured<T>(
  s: OllamaSettings,
  fetchImpl: FetchLike,
  system: string,
  user: string,
  modelSchema: z.ZodType,
  strictSchema: z.ZodType<T>,
  checklist = "",
  onProgress?: ProgressFn,
  cancel?: AbortSignal,
): Promise<{ data: T; inputTokens: number; outputTokens: number; model: string; repaired: boolean }> {
  const format = jsonSchemaFor(modelSchema);
  // The `format` grammar already enforces structure, so only a one-line field guide goes in the
  // prompt (fewer tokens to read). Key rules are repeated at the end, where small models follow best.
  const fields = Object.keys((format.properties as Record<string, unknown>) ?? {}).join(", ");
  const prompt = `${user}\n\nReply fields: ${fields}.${checklist ? `\n\nBefore answering, check:\n${checklist}` : ""}`;
  const messages: ChatMessage[] = [
    { role: "system", content: system + JSON_ONLY },
    { role: "user", content: prompt },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastContent = "";
  let lastIssues = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await chat(s, fetchImpl, messages, format, onProgress, cancel);
    inputTokens += out.inputTokens;
    outputTokens += out.outputTokens;
    lastContent = out.content;
    const json = extractJson(out.content);
    const checked = json === undefined ? null : strictSchema.safeParse(json);
    if (checked?.success) {
      return { data: checked.data, inputTokens, outputTokens, model: out.model, repaired: attempt > 1 };
    }
    lastIssues =
      (out.truncated ? "- The reply was cut off before it finished. Be more concise.\n" : "") +
      describeIssues(checked ? checked.error : null, json === undefined);
    // One repair attempt: show the model its own reply and the exact problems.
    messages.push(
      { role: "assistant", content: lastContent.slice(0, 12_000) },
      {
        role: "user",
        content: `Your reply did not pass validation:\n${lastIssues}\nReturn the corrected JSON object only. Keep the same topic and constraints. "variants" must contain exactly 3 items with ids "A", "B", "C".`,
      },
    );
  }
  throw new ProviderError(
    "invalid_output",
    "The local model returned invalid output twice. Small local models sometimes do this — retry, or try a larger OLLAMA_MODEL.",
    true,
  );
}

/**
 * Output token budget by requested length. A tight budget keeps small models from
 * rambling (CPU/iGPU speed is ~8–12 tokens/s); a truncated reply goes through repair.
 */
export function outputBudget(req: Pick<CaptionRequest, "context">, cap: number): number {
  const base = req.context.length === "short" ? 600 : req.context.length === "long" ? 1200 : 900;
  const script = req.context.language === "hindi" ? 300 : 0;
  return Math.min(cap, base + script);
}

export class OllamaCaptionProvider implements CaptionProvider {
  readonly name = "ollama";
  constructor(
    private settings: OllamaSettings,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async generate(req: CaptionRequest): Promise<ProviderOutput<CaptionResult>> {
    const out = await structured(
      { ...this.settings, maxOutputTokens: outputBudget(req, this.settings.maxOutputTokens) },
      this.fetchImpl,
      CAPTION_SYSTEM_PROMPT,
      buildCaptionUserPrompt(req),
      LocalCaptionSchema,
      LocalCaptionStrict,
      CAPTION_CHECKLIST,
      req.onProgress,
      req.signal,
    );
    return {
      data: out.data,
      mode: "local_ai",
      usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model },
    };
  }
}

export class OllamaBriefProvider implements BriefProvider {
  readonly name = "ollama";
  constructor(
    private settings: OllamaSettings,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async generate(req: BriefProviderRequest): Promise<ProviderOutput<Omit<BriefContent, "sourceRefs">>> {
    const out = await structured(
      this.settings,
      this.fetchImpl,
      BRIEF_SYSTEM_PROMPT,
      buildBriefUserPrompt(req),
      BriefModelOutputSchema,
      BriefContentSchema.omit({ sourceRefs: true }),
    );
    return {
      data: out.data,
      mode: "local_ai",
      usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model },
    };
  }
}
