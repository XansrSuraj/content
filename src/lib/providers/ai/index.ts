import "server-only";
import { aiStatus, config } from "@/lib/config";
import { AnthropicBriefProvider, AnthropicCaptionProvider, type AnthropicSettings } from "./anthropic";
import { OllamaBriefProvider, OllamaCaptionProvider, type OllamaSettings } from "./ollama";
import { OpenAICompatBriefProvider, OpenAICompatCaptionProvider, type OpenAICompatSettings } from "./openai-compatible";
import { TemplateBriefProvider, TemplateCaptionProvider } from "./template";
import type { BriefProvider, CaptionProvider } from "./types";

/**
 * Provider selection is explicit:
 * - AI_PROVIDER=openai_compatible (alias: groq) → hosted open-weight model (Groq by default)
 * - AI_PROVIDER=ollama   → local model (errors if Ollama is down; never swaps to template)
 * - AI_PROVIDER=template → labeled template preview
 * - anthropic / unset    → Anthropic when fully configured, else the labeled template preview
 * A live provider failure is surfaced as an error, never silently replaced by the template.
 */

function anthropicSettings(): AnthropicSettings | null {
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

function ollamaSettings(): OllamaSettings | null {
  const cfg = config();
  return aiStatus(cfg).kind === "local" ? { ...cfg.ollama } : null;
}

function openSettings(): OpenAICompatSettings | null {
  const cfg = config();
  if (aiStatus(cfg).kind !== "open") return null;
  const { apiKeyPresent: _present, ...rest } = cfg.openCompat;
  void _present;
  return { ...rest, apiKey: process.env.OPENAI_COMPAT_API_KEY?.trim() || null };
}

export function getCaptionProvider(): CaptionProvider {
  const open = openSettings();
  if (open) return new OpenAICompatCaptionProvider(open);
  const local = ollamaSettings();
  if (local) return new OllamaCaptionProvider(local);
  const s = anthropicSettings();
  return s ? new AnthropicCaptionProvider(s) : new TemplateCaptionProvider();
}

export function getBriefProvider(): BriefProvider {
  const open = openSettings();
  if (open) return new OpenAICompatBriefProvider(open);
  const local = ollamaSettings();
  if (local) return new OllamaBriefProvider(local);
  const s = anthropicSettings();
  return s ? new AnthropicBriefProvider(s) : new TemplateBriefProvider();
}

export * from "./types";
