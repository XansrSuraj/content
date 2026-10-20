import type { HashtagStatus } from "@/lib/domain/hashtags";
import type { CaptionResult, GenerationMode } from "@/lib/domain/captions";
import { CaptionResultSchema } from "@/lib/domain/captions";
import type { Message } from "@/lib/repo/studio";
import type { SportsContextUsed, TrendContextItem } from "@/lib/db/schema";
import type { EvidenceBundle } from "@/lib/domain/evidence";

/** Plain JSON shapes sent to the client (dates as ISO strings). */
export interface ClientHashtagStatus {
  tag: string;
  status: "suggested" | "verified" | "search_interest" | "demo";
  evidence: {
    sourceName: string;
    platform: string;
    geo: string;
    observedAt: string;
    retrievedAt: string;
    coverageNote: string;
    url: string | null;
  }[];
}

export interface ClientMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode: GenerationMode | null;
  result: CaptionResult | null;
  hashtags: ClientHashtagStatus[];
  /** null = message predates trend context; [] = looked, nothing matched. */
  contextUsed: TrendContextItem[] | null;
  /** Match facts, intent and references used for this answer; null when none applied. */
  sports: SportsContextUsed | null;
  /** Gated evidence bundle; null for answers made before evidence bundles existed. */
  evidence: EvidenceBundle | null;
  createdAt: string;
}

export function toClientHashtags(statuses: HashtagStatus[]): ClientHashtagStatus[] {
  return statuses.map((s) => ({
    tag: s.tag,
    status: s.status,
    evidence:
      s.status === "suggested"
        ? []
        : s.evidence.slice(0, 3).map((e) => ({
            sourceName: e.sourceName,
            platform: e.platform,
            geo: e.geo,
            observedAt: e.observedAt.toISOString(),
            retrievedAt: e.retrievedAt.toISOString(),
            coverageNote: e.coverageNote,
            url: e.url,
          })),
  }));
}

export function toClientMessage(m: Message, hashtags: HashtagStatus[] = []): ClientMessage {
  const parsed = m.result ? CaptionResultSchema.safeParse(m.result) : null;
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    mode: m.mode,
    result: parsed?.success ? parsed.data : null,
    hashtags: toClientHashtags(hashtags),
    contextUsed: m.contextUsed ?? null,
    sports: m.sports ?? null,
    evidence: m.evidence ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}
