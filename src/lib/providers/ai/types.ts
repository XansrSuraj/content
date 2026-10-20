import type { CaptionContext, CaptionResult, GenerationMode } from "@/lib/domain/captions";
import type { BriefContent, BriefRequest } from "@/lib/domain/briefs";

export type ProviderErrorCode =
  | "not_configured"
  /** Local provider (Ollama) not running, or the model is not installed. */
  | "local_unavailable"
  | "timeout"
  | "upstream_rate_limited"
  | "upstream_error"
  | "auth_error"
  | "invalid_output"
  | "refusal"
  /** The creator pressed Stop. Nothing is saved. */
  | "cancelled";

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
}

export interface ProviderOutput<T> {
  data: T;
  mode: GenerationMode;
  usage: ProviderUsage;
}

export interface CreatorSnapshot {
  displayName: string;
  categories: string[];
  styleNotes: string;
  personalExamples: string;
}

export interface CaptionTurn {
  role: "user" | "assistant";
  /** For assistant turns: a compact rendering of the previous variants. */
  text: string;
}

export interface CaptionRequest {
  context: CaptionContext;
  /** The creator's original caption / video description (first message). */
  originalInput: string;
  /** The latest creator message (equal to originalInput on the first turn). */
  message: string;
  history: CaptionTurn[];
  creator: CreatorSnapshot | null;
  /** Opportunity/brief evidence the creator chose to bring in (titles + sources only). */
  evidenceNotes: string[];
  /** Optional live progress (local streaming provider). Providers may ignore it. */
  onProgress?: (p: { tokens: number; text: string }) => void;
  /** Aborted when the creator presses Stop / closes the request. Providers may ignore it. */
  signal?: AbortSignal;
  /** Set on a repair attempt: what the previous answer got wrong (from the deterministic validator). */
  repair?: string[];
}

export interface CaptionProvider {
  readonly name: string;
  generate(req: CaptionRequest): Promise<ProviderOutput<CaptionResult>>;
}

export interface BriefProviderRequest extends BriefRequest {
  creator: CreatorSnapshot | null;
  evidenceNotes: string[];
}

export interface BriefProvider {
  readonly name: string;
  generate(req: BriefProviderRequest): Promise<ProviderOutput<Omit<BriefContent, "sourceRefs">>>;
}
