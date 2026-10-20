import "server-only";
import { z } from "zod";
import { aiStatus, config, selectedModel } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  applyFollowUpToContext,
  CaptionContextSchema,
  CaptionResultSchema,
  enforceConstraints,
  type CaptionContext,
  type CaptionResult,
} from "@/lib/domain/captions";
import { classifyHashtags, type HashtagStatus } from "@/lib/domain/hashtags";
import { getCaptionProvider, ProviderError, type CaptionProvider, type CaptionTurn } from "@/lib/providers/ai";
import { getProfile, recordEvent, recordUsage } from "@/lib/repo/creator";
import { evidenceFor, getOpportunity, hashtagEvidence, searchInterestByTerm } from "@/lib/repo/discovery";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import {
  addMessage,
  createConversation,
  getConversation,
  listMessages,
  updateConversation,
  type Message,
} from "@/lib/repo/studio";
import { checkAiQuota } from "@/lib/security/rate-limit";
import { buildEvidence } from "./evidence";
import { buildSportsContext } from "./sports-context";

export const CaptionTurnSchema = z.object({
  conversationId: z.string().max(64).nullable().default(null),
  message: z.string().trim().min(1).max(8_000),
  /** Full context from the editable panel. Optional on follow-ups. */
  context: CaptionContextSchema.partial().optional(),
  opportunityId: z.string().max(64).nullable().default(null),
  /** Client-generated id so the creator can cancel this turn (Stop). */
  turnId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});
export type CaptionTurnInput = z.infer<typeof CaptionTurnSchema>;

export type TurnError =
  | { kind: "validation"; message: string }
  | { kind: "not_found" }
  | { kind: "quota"; message: string; retryAfterSeconds: number }
  | { kind: "provider"; code: ProviderError["code"]; message: string; retryable: boolean };

export interface TurnSuccess {
  conversationId: string;
  context: CaptionContext;
  applied: string[];
  userMessage: Message;
  assistantMessage: Message;
}

function compactResult(r: CaptionResult): string {
  const rec = r.variants.find((v) => v.id === r.recommendedVariantId);
  return (
    r.variants.map((v) => `Option ${v.id} (${v.approach}): ${v.caption.replace(/\s+/g, " ").slice(0, 400)}`).join("\n") +
    `\nRecommended: ${rec?.id ?? r.recommendedVariantId}`
  );
}

export function historyFromMessages(msgs: Message[]): CaptionTurn[] {
  const turns: CaptionTurn[] = [];
  for (const m of msgs.slice(-12)) {
    if (m.role === "user") turns.push({ role: "user", text: m.text.slice(0, 1500) });
    else if (m.result) {
      const parsed = CaptionResultSchema.safeParse(m.result);
      if (parsed.success) turns.push({ role: "assistant", text: compactResult(parsed.data) });
    }
  }
  return turns;
}

export async function runCaptionTurn(
  db: DB,
  user: SessionUser,
  input: CaptionTurnInput,
  provider: CaptionProvider = getCaptionProvider(),
  opts: { onProgress?: (p: { tokens: number; text: string }) => void; signal?: AbortSignal } = {},
): Promise<{ ok: true; value: TurnSuccess } | { ok: false; error: TurnError }> {
  const cfg = config();
  if (input.message.length > cfg.ai.maxInputChars) {
    return { ok: false, error: { kind: "validation", message: `Message is too long (max ${cfg.ai.maxInputChars} characters).` } };
  }

  const profile = await getProfile(db, user.id);
  let conversation = input.conversationId ? await getConversation(db, user.id, input.conversationId) : null;
  if (input.conversationId && !conversation) return { ok: false, error: { kind: "not_found" } };

  const history = conversation ? await listMessages(db, user.id, conversation.id) : [];
  const firstUser = history.find((m) => m.role === "user");
  const originalInput = firstUser?.text ?? input.message;

  // Context: stored context, then explicit panel edits, then follow-up instructions.
  const base = conversation
    ? CaptionContextSchema.parse(conversation.context)
    : CaptionContextSchema.parse({
        language: profile?.contentLanguages[0],
        tone: profile?.defaultTone,
        platform: profile?.platforms.find((p) => p) ?? undefined,
        region: profile?.region,
      });
  const panel = CaptionContextSchema.safeParse({ ...base, ...(input.context ?? {}) });
  if (!panel.success) return { ok: false, error: { kind: "validation", message: "Invalid caption settings." } };
  const { context, applied } = firstUser
    ? applyFollowUpToContext(input.message, panel.data, originalInput)
    : { context: panel.data, applied: [] as string[] };

  const aiKind = aiStatus(cfg).kind;
  const quota = await checkAiQuota(db, user.id, {
    perMinute: cfg.limits.aiPerUserPerMinute,
    perDay: user.isDemo ? cfg.limits.demoAiPerUserPerDay : cfg.limits.aiPerUserPerDay,
  });
  if (!quota.ok) {
    await recordUsage(db, { userId: user.id, kind: "caption", provider: provider.name, status: "rejected", errorCode: `quota_${quota.reason}` });
    return {
      ok: false,
      error: {
        kind: "quota",
        message: quota.reason === "minute" ? "Thoda ruk jao — too many requests this minute." : "Aaj ka limit poora ho gaya. Try again tomorrow.",
        retryAfterSeconds: quota.retryAfterSeconds,
      },
    };
  }

  const opportunityId = conversation?.opportunityId ?? input.opportunityId ?? null;
  const conversationText = `${originalInput}
${input.message}`;
  // Match facts, stage and references first: their team names also sharpen the search-trend match.
  const sports = await buildSportsContext(db, user.id, {
    text: conversationText,
    matchId: context.matchId,
    publishAt: context.publishAt,
    timeZone: profile?.sports?.timezone || "Asia/Kolkata",
  });
  // Search interest, platform observations and references — gated for relevance, from cached data only.
  const evidence = await buildEvidence(db, user.id, {
    text: `${conversationText}
${sports.trendTerms}`,
    intent: sports.intent,
    match: sports.match,
    stage: sports.stage,
    publishAt: context.publishAt ? new Date(context.publishAt) : null,
    region: context.region,
    useTrends: context.useTrends,
    includeDemo: user.isDemo && cfg.demoEnabled,
  });
  if (sports.used) sports.used.references = evidence.references;
  const trendItems = evidence.trendItems;
  const evidenceNotes = [
    ...(opportunityId ? await opportunityNotes(db, user, opportunityId) : []),
    ...sports.notes,
    ...evidence.notes,
  ];

  const started = Date.now();
  let output;
  try {
    output = await provider.generate({
      context,
      originalInput,
      message: input.message,
      history: historyFromMessages(history),
      creator: profile
        ? {
            displayName: profile.displayName,
            categories: profile.categories,
            styleNotes: profile.styleNotes,
            personalExamples: profile.personalExamples,
          }
        : null,
      evidenceNotes,
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError("upstream_error", "Unexpected provider failure.", true);
    await recordUsage(db, {
      userId: user.id,
      kind: "caption",
      provider: provider.name,
      model: selectedModel(cfg),
      status: "error",
      errorCode: pe.code,
      latencyMs: Date.now() - started,
    });
    return { ok: false, error: { kind: "provider", code: pe.code, message: pe.message, retryable: pe.retryable } };
  }

  // Stopped after the model finished: honour it and save nothing.
  if (opts.signal?.aborted) {
    return { ok: false, error: { kind: "provider", code: "cancelled", message: "Stopped.", retryable: true } };
  }
  const result = flagUnmetRequests(enforceConstraints(output.data, context), applied, history);

  if (!conversation) {
    conversation = await createConversation(db, user.id, {
      title: titleFrom(input.message),
      context,
      opportunityId: input.opportunityId,
    });
  } else {
    await updateConversation(db, user.id, conversation.id, { context });
  }
  const userMessage = (await addMessage(db, user.id, conversation.id, { role: "user", text: input.message }))!;
  const assistantMessage = (await addMessage(db, user.id, conversation.id, {
    role: "assistant",
    text: "",
    result,
    mode: output.mode,
    contextUsed: trendItems,
    sports: sports.used,
    evidence: evidence.bundle,
  }))!;

  await recordUsage(db, {
    userId: user.id,
    kind: "caption",
    provider: provider.name,
    model: output.usage.model,
    status: "ok",
    inputTokens: output.usage.inputTokens,
    outputTokens: output.usage.outputTokens,
    latencyMs: Date.now() - started,
  });
  await recordEvent(db, user.id, "caption_generated", { conversationId: conversation.id, mode: output.mode, live: aiKind === "live", local: aiKind === "local" });

  return { ok: true, value: { conversationId: conversation.id, context, applied, userMessage, assistantMessage } };
}

/**
 * Some requests can't be enforced deterministically (e.g. "shorter"). When the
 * model visibly ignored one, say so instead of presenting it as done.
 */
export function flagUnmetRequests(result: CaptionResult, applied: string[], history: Message[]): CaptionResult {
  if (!applied.includes("Length: short")) return result;
  const prevMsg = [...history].reverse().find((m) => m.role === "assistant" && m.result);
  const prev = prevMsg ? CaptionResultSchema.safeParse(prevMsg.result) : null;
  if (!prev?.success) return result;
  const avg = (r: CaptionResult) => r.variants.reduce((n, v) => n + v.caption.length, 0) / r.variants.length;
  if (avg(result) < avg(prev.data) * 0.9) return result;
  return {
    ...result,
    limitations: [...result.limitations, "These options are not shorter than the previous ones. Try “Aur short karo” again or edit them yourself."].slice(0, 6),
  };
}

function titleFrom(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "Untitled caption";
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

async function opportunityNotes(db: DB, user: SessionUser, opportunityId: string): Promise<string[]> {
  const opp = await getOpportunity(db, opportunityId, user.isDemo ? "any" : "observed");
  if (!opp) return [];
  const ev = (await evidenceFor(db, [opp.id])).get(opp.id) ?? [];
  return [
    `Opportunity: ${opp.title} — ${opp.summary}`,
    ...ev.slice(0, 5).map(
      (o) => `Evidence: "${o.title}" from ${SOURCE_NAMES[o.sourceKey] ?? o.sourceKey}, observed ${o.observedAt.toISOString().slice(0, 10)}${o.isDemo ? " (demo sample)" : ""}`,
    ),
  ];
}

/** Trend status is computed at read time from stored evidence — never stored from model output. */
export async function hashtagStatusesFor(
  db: DB,
  user: SessionUser,
  result: CaptionResult,
  platform: string,
): Promise<HashtagStatus[]> {
  const tags = [...result.hashtagSuggestions.map((h) => h.tag), ...result.variants.flatMap((v) => v.hashtags), ...result.platformVersions.flatMap((p) => p.hashtags)];
  const [evidence, search] = await Promise.all([hashtagEvidence(db, tags, user.isDemo), searchInterestByTerm(db)]);
  return classifyHashtags(tags, evidence, platform, new Date(), search);
}

/** Same as hashtagStatusesFor, for many results at once: one evidence query for the whole conversation. */
export async function hashtagStatusesForMany(
  db: DB,
  user: SessionUser,
  results: (CaptionResult | null)[],
  platform: string,
): Promise<HashtagStatus[][]> {
  const tagsOf = (r: CaptionResult) => [...r.hashtagSuggestions.map((h) => h.tag), ...r.variants.flatMap((v) => v.hashtags), ...r.platformVersions.flatMap((p) => p.hashtags)];
  const all = results.flatMap((r) => (r ? tagsOf(r) : []));
  const [evidence, search] = all.length ? await Promise.all([hashtagEvidence(db, all, user.isDemo), searchInterestByTerm(db)]) : [new Map(), new Map()];
  return results.map((r) => (r ? classifyHashtags(tagsOf(r), evidence, platform, new Date(), search) : []));
}
