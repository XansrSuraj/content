import type { HashtagStatus } from "@/lib/domain/hashtags";
import type { CaptionResult, GenerationMode } from "@/lib/domain/captions";
import { CaptionResultSchema } from "@/lib/domain/captions";
import type { Message } from "@/lib/repo/studio";
import type { TrendContextItem } from "@/lib/db/schema";

/** Plain JSON shapes sent to the client (dates as ISO strings). */
export interface ClientHashtagStatus {
  tag: string;
  status: "suggested" | "verified" | "demo";
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
    createdAt: m.createdAt.toISOString(),
  };
}
