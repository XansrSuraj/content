import "server-only";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { BriefContentSchema, type BriefRequest } from "@/lib/domain/briefs";
import { getBriefProvider, ProviderError, type BriefProvider } from "@/lib/providers/ai";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { getProfile, recordEvent, recordUsage } from "@/lib/repo/creator";
import { evidenceFor, getOpportunity } from "@/lib/repo/discovery";
import { createBrief, type Brief } from "@/lib/repo/work";
import { checkAiQuota } from "@/lib/security/rate-limit";
import type { TurnError } from "./captions";

export async function generateBrief(
  db: DB,
  user: SessionUser,
  req: BriefRequest,
  provider: BriefProvider = getBriefProvider(),
): Promise<{ ok: true; brief: Brief } | { ok: false; error: TurnError }> {
  const cfg = config();
  const opp = req.opportunityId
    ? await getOpportunity(db, req.opportunityId, user.isDemo && cfg.demoEnabled ? "any" : "observed")
    : null;
  if (req.opportunityId && !opp) return { ok: false, error: { kind: "not_found" } };

  const quota = await checkAiQuota(db, user.id, {
    perMinute: cfg.limits.aiPerUserPerMinute,
    perDay: user.isDemo ? cfg.limits.demoAiPerUserPerDay : cfg.limits.aiPerUserPerDay,
  });
  if (!quota.ok) {
    return { ok: false, error: { kind: "quota", message: "Request limit reached. Try again later.", retryAfterSeconds: quota.retryAfterSeconds } };
  }

  const evidence = opp ? ((await evidenceFor(db, [opp.id])).get(opp.id) ?? []) : [];
  const profile = await getProfile(db, user.id);
  const started = Date.now();
  try {
    const out = await provider.generate({
      ...req,
      creator: profile
        ? { displayName: profile.displayName, categories: profile.categories, styleNotes: profile.styleNotes, personalExamples: profile.personalExamples }
        : null,
      evidenceNotes: opp
        ? [
            `Opportunity: ${opp.title} — ${opp.summary}`,
            ...opp.angles.map((a) => `Suggested angle: ${a.title} — ${a.description}`),
            ...evidence.map((e) => `Evidence: "${e.title}" (${SOURCE_NAMES[e.sourceKey] ?? e.sourceKey}, ${e.observedAt.toISOString().slice(0, 10)})`),
            ...(opp.sensitivityNote ? [`Sensitivity: ${opp.sensitivityNote}`] : []),
          ]
        : [],
    });
    // Source references are attached by the server from stored evidence, not by the model.
    const content = BriefContentSchema.parse({
      ...out.data,
      sourceRefs: evidence.slice(0, 10).map((e) => ({
        title: e.title,
        url: e.url,
        sourceName: `${SOURCE_NAMES[e.sourceKey] ?? e.sourceKey}${e.isDemo ? " (demo)" : ""}`,
        observedAt: e.observedAt.toISOString(),
      })),
    });
    const brief = await createBrief(db, user.id, {
      opportunityId: opp?.id ?? null,
      topic: req.topic,
      platform: req.platform,
      content,
      mode: out.mode,
    });
    await recordUsage(db, {
      userId: user.id,
      kind: "brief",
      provider: provider.name,
      model: out.usage.model,
      status: "ok",
      inputTokens: out.usage.inputTokens,
      outputTokens: out.usage.outputTokens,
      latencyMs: Date.now() - started,
    });
    await recordEvent(db, user.id, "brief_generated", { briefId: brief.id, opportunityId: opp?.id ?? null, mode: out.mode });
    return { ok: true, brief };
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError("invalid_output", "The brief could not be generated.", true);
    await recordUsage(db, { userId: user.id, kind: "brief", provider: provider.name, model: cfg.ai.model, status: "error", errorCode: pe.code, latencyMs: Date.now() - started });
    return { ok: false, error: { kind: "provider", code: pe.code, message: pe.message, retryable: pe.retryable } };
  }
}
