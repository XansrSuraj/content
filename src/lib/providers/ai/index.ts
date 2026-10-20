import "server-only";
import { aiStatus, config } from "@/lib/config";
import { AnthropicBriefProvider, AnthropicCaptionProvider, type AnthropicSettings } from "./anthropic";
import { TemplateBriefProvider, TemplateCaptionProvider } from "./template";
import type { BriefProvider, CaptionProvider } from "./types";

/**
 * Provider selection is explicit: live AI only when fully configured; otherwise
 * the labeled template preview. A live provider failure is surfaced as an error,
 * never silently replaced by the template.
 */

function settings(): AnthropicSettings | null {
  const cfg = config();
  const status = aiStatus(cfg);
  if (status.kind !== "live") return null;
  return {
    apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
    model: status.model,
    timeoutMs: cfg.ai.timeoutMs,
    maxOutputTokens: cfg.ai.maxOutputTokens,
    effort: cfg.ai.effort,
    fallbacks: cfg.ai.fallbacks,
  };
}

export function getCaptionProvider(): CaptionProvider {
  const s = settings();
  return s ? new AnthropicCaptionProvider(s) : new TemplateCaptionProvider();
}

export function getBriefProvider(): BriefProvider {
  const s = settings();
  return s ? new AnthropicBriefProvider(s) : new TemplateBriefProvider();
}

export * from "./types";
