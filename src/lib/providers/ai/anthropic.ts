import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  CaptionFromModelSchema,
  CaptionModelOutputSchema,
  type CaptionResult,
} from "@/lib/domain/captions";
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

export interface AnthropicSettings {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  effort: "low" | "medium" | "high" | null;
  fallbacks: "default" | "off";
}

/** The narrow slice of the SDK this adapter uses — lets tests inject a fake. */
export interface ParseClient {
  beta: { messages: { parse: Anthropic["beta"]["messages"]["parse"] } };
}

export function createAnthropicClient(s: AnthropicSettings): ParseClient {
  // One SDK retry for transient 429/5xx/connection errors; our own deadline below caps wall-clock.
  return new Anthropic({ apiKey: s.apiKey, timeout: s.timeoutMs, maxRetries: 1 });
}

async function callStructured<T extends z.ZodType>(
  client: ParseClient,
  s: AnthropicSettings,
  system: string,
  user: string,
  schema: T,
): Promise<{ parsed: z.infer<T>; inputTokens: number; outputTokens: number; model: string }> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), s.timeoutMs + 5_000);
  try {
    const response = await client.beta.messages.parse(
      {
        model: s.model,
        max_tokens: s.maxOutputTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: {
          ...(s.effort ? { effort: s.effort } : {}),
          format: betaZodOutputFormat(schema),
        },
        ...(s.fallbacks === "default"
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: controller.signal },
    );

    if (response.stop_reason === "refusal") {
      throw new ProviderError(
        "refusal",
        "The AI declined this request. Try rephrasing the topic or caption.",
        false,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("invalid_output", "The AI response was cut off before it finished.", true);
    }
    if (!response.parsed_output) {
      throw new ProviderError("invalid_output", "The AI response did not match the expected format.", true);
    }
    return {
      parsed: response.parsed_output as z.infer<T>,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  } catch (err) {
    throw mapError(err);
  } finally {
    clearTimeout(deadline);
  }
}

export function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("timeout", "The AI provider took too long to respond.", true);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth_error", "The AI provider rejected the server's credentials.", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("upstream_rate_limited", "The AI provider is busy right now.", true);
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    // Most commonly an unsupported model id or parameter for the configured model.
    return new ProviderError("upstream_error", "The AI provider rejected the request configuration.", false);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("upstream_error", "Could not reach the AI provider.", true);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError("upstream_error", "The AI provider returned an error.", true);
  }
  if (err instanceof Error && err.name === "AbortError") {
    return new ProviderError("timeout", "The AI provider took too long to respond.", true);
  }
  // Includes JSON/schema parse failures thrown by the SDK helper.
  return new ProviderError("invalid_output", "The AI response could not be read.", true);
}

export class AnthropicCaptionProvider implements CaptionProvider {
  readonly name = "anthropic";
  constructor(
    private settings: AnthropicSettings,
    private client: ParseClient = createAnthropicClient(settings),
  ) {}

  async generate(req: CaptionRequest): Promise<ProviderOutput<CaptionResult>> {
    const out = await callStructured(
      this.client,
      this.settings,
      CAPTION_SYSTEM_PROMPT,
      buildCaptionUserPrompt(req),
      CaptionModelOutputSchema,
    );
    const checked = CaptionFromModelSchema.safeParse(out.parsed);
    if (!checked.success) {
      throw new ProviderError("invalid_output", "The AI response failed validation (e.g. not exactly 3 options).", true);
    }
    return {
      data: checked.data,
      mode: "live_ai",
      usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model },
    };
  }
}

export class AnthropicBriefProvider implements BriefProvider {
  readonly name = "anthropic";
  constructor(
    private settings: AnthropicSettings,
    private client: ParseClient = createAnthropicClient(settings),
  ) {}

  async generate(req: BriefProviderRequest): Promise<ProviderOutput<Omit<BriefContent, "sourceRefs">>> {
    const out = await callStructured(
      this.client,
      this.settings,
      BRIEF_SYSTEM_PROMPT,
      buildBriefUserPrompt(req),
      BriefModelOutputSchema,
    );
    const checked = BriefContentSchema.omit({ sourceRefs: true }).safeParse(out.parsed);
    if (!checked.success) {
      throw new ProviderError("invalid_output", "The AI brief failed validation.", true);
    }
    return {
      data: checked.data,
      mode: "live_ai",
      usage: { inputTokens: out.inputTokens, outputTokens: out.outputTokens, model: out.model },
    };
  }
}
