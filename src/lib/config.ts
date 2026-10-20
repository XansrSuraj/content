import "server-only";

/**
 * Central, validated runtime configuration. Everything that decides "demo vs
 * real" lives here so the rules are visible in one place and testable.
 */

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface AppConfig {
  isProduction: boolean;
  /** Demo sign-in and demo sample datasets. */
  demoEnabled: boolean;
  /** Why demo is on/off, shown in admin status. */
  demoReason: string;
  appUrl: string;
  adminEmails: string[];
  ai: {
    apiKeyPresent: boolean;
    model: string | null;
    fallbacks: "default" | "off";
    timeoutMs: number;
    maxOutputTokens: number;
    maxInputChars: number;
    /** null = omit the effort parameter (for models that do not support it). */
    effort: "low" | "medium" | "high" | null;
  };
  limits: {
    aiPerUserPerDay: number;
    aiPerUserPerMinute: number;
    demoAiPerUserPerDay: number;
    authPerIpPer15Min: number;
  };
  sources: {
    wikimediaEnabled: boolean;
    wikimediaUserAgent: string | null;
    youtubeApiKeyPresent: boolean;
  };
  ingestSecretPresent: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const demoRequested = bool(env.TRENDSAATHI_DEMO_MODE, !isProduction);
  // Production never runs demo auth unless an operator opts in twice.
  const publicDemoAllowed = bool(env.TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION);
  let demoEnabled = demoRequested;
  let demoReason = demoRequested ? "TRENDSAATHI_DEMO_MODE is on" : "TRENDSAATHI_DEMO_MODE is off";
  if (isProduction && demoRequested && !publicDemoAllowed) {
    demoEnabled = false;
    demoReason =
      "Disabled in production. Set TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION=true as well to run a public demo.";
  }

  const model = env.ANTHROPIC_MODEL?.trim() || null;
  const effort = env.ANTHROPIC_EFFORT;

  return {
    isProduction,
    demoEnabled,
    demoReason,
    appUrl: env.APP_URL || "http://localhost:3000",
    adminEmails: (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    ai: {
      apiKeyPresent: Boolean(env.ANTHROPIC_API_KEY?.trim()),
      model,
      fallbacks: env.ANTHROPIC_FALLBACKS === "off" ? "off" : "default",
      timeoutMs: int(env.AI_TIMEOUT_MS, 60_000),
      maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 8_000),
      maxInputChars: int(env.AI_MAX_INPUT_CHARS, 4_000),
      effort: effort === "omit" ? null : effort === "medium" || effort === "high" ? effort : "low",
    },
    limits: {
      aiPerUserPerDay: int(env.AI_REQUESTS_PER_USER_PER_DAY, 40),
      aiPerUserPerMinute: int(env.AI_REQUESTS_PER_USER_PER_MINUTE, 6),
      demoAiPerUserPerDay: int(env.DEMO_AI_REQUESTS_PER_USER_PER_DAY, 10),
      authPerIpPer15Min: int(env.AUTH_ATTEMPTS_PER_IP_PER_15_MIN, 20),
    },
    sources: {
      wikimediaEnabled: bool(env.SOURCE_WIKIMEDIA_ENABLED, false),
      wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT?.trim() || null,
      youtubeApiKeyPresent: Boolean(env.YOUTUBE_API_KEY?.trim()),
    },
    ingestSecretPresent: (env.INGEST_SECRET?.length ?? 0) >= 32,
  };
}

let cached: AppConfig | null = null;
export function config(): AppConfig {
  if (!cached) cached = readConfig();
  return cached;
}

/** Test-only: re-read process.env on next access. */
export function resetConfigCache(): void {
  cached = null;
}

export type AiStatus =
  | { kind: "live"; model: string }
  | { kind: "not_configured"; missing: string[] };

export function aiStatus(cfg: AppConfig = config()): AiStatus {
  const missing: string[] = [];
  if (!cfg.ai.apiKeyPresent) missing.push("ANTHROPIC_API_KEY");
  if (!cfg.ai.model) missing.push("ANTHROPIC_MODEL");
  if (missing.length) return { kind: "not_configured", missing };
  return { kind: "live", model: cfg.ai.model! };
}
