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
    /** "auto" (unset) keeps the original behaviour: Anthropic when configured, else template preview. */
    provider: "auto" | "anthropic" | "ollama" | "openai_compatible" | "template" | "invalid";
    apiKeyPresent: boolean;
    model: string | null;
    fallbacks: "default" | "off";
    timeoutMs: number;
    maxOutputTokens: number;
    maxInputChars: number;
    /** null = omit the effort parameter (for models that do not support it). */
    effort: "low" | "medium" | "high" | null;
  };
  /** Open-weight models via an OpenAI-compatible host (Groq by default). */
  openCompat: {
    baseUrl: string;
    apiKeyPresent: boolean;
    model: string;
    hostLabel: string;
    timeoutMs: number;
    maxOutputTokens: number;
    jsonMode: "json_schema" | "json_object";
    reasoningEffort: "low" | "medium" | "high" | null;
  };
  /** Local model via Ollama (free, runs on this machine). Development quality only. */
  ollama: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    numCtx: number;
    maxOutputTokens: number;
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
    googleTrendsRssEnabled: boolean;
    appleMusicEnabled: boolean;
    applePodcastsEnabled: boolean;
    blueskyEnabled: boolean;
    mastodonEnabled: boolean;
    openfootballEnabled: boolean;
    footballDataTokenPresent: boolean;
    cricApiKeyPresent: boolean;
    /** User-Agent for keyless public feeds. */
    userAgent: string;
  };
  ingestSecretPresent: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const keylessDefault = env.NODE_ENV !== "test";
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
  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase() ?? "";
  const provider: AppConfig["ai"]["provider"] =
    rawProvider === ""
      ? "auto"
      : rawProvider === "anthropic" || rawProvider === "ollama" || rawProvider === "template" || rawProvider === "openai_compatible"
        ? rawProvider
        : rawProvider === "groq"
          ? "openai_compatible"
          : "invalid";
  const compatRaw = (env.OPENAI_COMPAT_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const compatUrl = /^https?:\/\//i.test(compatRaw) ? compatRaw : "https://api.groq.com/openai/v1";
  const compatHost = env.OPENAI_COMPAT_HOST_LABEL?.trim() || (/groq\.com/i.test(compatUrl) ? "Groq" : new URL(compatUrl).hostname);
  const compatModel = env.OPENAI_COMPAT_MODEL?.trim() || "openai/gpt-oss-20b";
  const effortRaw = env.OPENAI_COMPAT_REASONING_EFFORT?.trim();
  const ollamaUrl = env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";

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
      provider,
      apiKeyPresent: Boolean(env.ANTHROPIC_API_KEY?.trim()),
      model,
      fallbacks: env.ANTHROPIC_FALLBACKS === "off" ? "off" : "default",
      timeoutMs: int(env.AI_TIMEOUT_MS, 60_000),
      maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 8_000),
      maxInputChars: int(env.AI_MAX_INPUT_CHARS, 4_000),
      effort: effort === "omit" ? null : effort === "medium" || effort === "high" ? effort : "low",
    },
    openCompat: {
      baseUrl: compatUrl,
      apiKeyPresent: Boolean(env.OPENAI_COMPAT_API_KEY?.trim()),
      model: compatModel,
      hostLabel: compatHost,
      timeoutMs: int(env.OPENAI_COMPAT_TIMEOUT_MS, 60_000),
      maxOutputTokens: int(env.OPENAI_COMPAT_MAX_OUTPUT_TOKENS, 3_000),
      jsonMode: env.OPENAI_COMPAT_JSON_MODE === "json_object" ? "json_object" : "json_schema",
      // gpt-oss models reason before answering; "low" keeps captions fast. "none" disables the parameter.
      reasoningEffort:
        effortRaw === "none" ? null : effortRaw === "medium" || effortRaw === "high" || effortRaw === "low" ? effortRaw : /gpt-oss/i.test(compatModel) ? "low" : null,
    },
    ollama: {
      baseUrl: /^https?:\/\//i.test(ollamaUrl) ? ollamaUrl.replace(/\/+$/, "") : "http://localhost:11434",
      model: env.OLLAMA_MODEL?.trim() || "llama3.2:3b",
      // CPU inference is slow; allow more time than the hosted provider.
      timeoutMs: int(env.OLLAMA_TIMEOUT_MS, 180_000),
      numCtx: int(env.OLLAMA_NUM_CTX, 4_096),
      maxOutputTokens: int(env.OLLAMA_MAX_OUTPUT_TOKENS, 1_500),
    },
    limits: {
      aiPerUserPerDay: int(env.AI_REQUESTS_PER_USER_PER_DAY, 40),
      aiPerUserPerMinute: int(env.AI_REQUESTS_PER_USER_PER_MINUTE, 6),
      demoAiPerUserPerDay: int(env.DEMO_AI_REQUESTS_PER_USER_PER_DAY, 10),
      authPerIpPer15Min: int(env.AUTH_ATTEMPTS_PER_IP_PER_15_MIN, 20),
    },
    sources: {
      // Keyless public feeds are on by default (off under test so unit tests never hit the network).
      wikimediaEnabled: bool(env.SOURCE_WIKIMEDIA_ENABLED, keylessDefault),
      // Wikimedia asks for a User-Agent with a contact URL; the app URL and the public repo serve as contact.
      wikimediaUserAgent: env.WIKIMEDIA_USER_AGENT?.trim() || `TrendSaathi/1.0 (${env.APP_URL || "https://trendsaathi.onrender.com"}; https://github.com/XansrSuraj/content)`,
      youtubeApiKeyPresent: Boolean(env.YOUTUBE_API_KEY?.trim()),
      googleTrendsRssEnabled: bool(env.SOURCE_GOOGLE_TRENDS_RSS_ENABLED, keylessDefault),
      appleMusicEnabled: bool(env.SOURCE_APPLE_MUSIC_ENABLED, keylessDefault),
      applePodcastsEnabled: bool(env.SOURCE_APPLE_PODCASTS_ENABLED, keylessDefault),
      blueskyEnabled: bool(env.SOURCE_BLUESKY_ENABLED, keylessDefault),
      mastodonEnabled: bool(env.SOURCE_MASTODON_ENABLED, keylessDefault),
      openfootballEnabled: bool(env.SOURCE_OPENFOOTBALL_ENABLED, keylessDefault),
      footballDataTokenPresent: Boolean(env.FOOTBALL_DATA_TOKEN?.trim()),
      cricApiKeyPresent: Boolean(env.CRICAPI_KEY?.trim()),
      userAgent: env.TRENDSAATHI_USER_AGENT?.trim() || `TrendSaathi/0.1 (+${env.APP_URL || "http://localhost:3000"})`,
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
  /** Local development model. Reachability is checked per request, never assumed. */
  | { kind: "local"; model: string; baseUrl: string }
  /** Hosted open-weight model (e.g. gpt-oss via Groq). */
  | { kind: "open"; model: string; host: string }
  | { kind: "not_configured"; missing: string[]; note?: string };

export function aiStatus(cfg: AppConfig = config()): AiStatus {
  if (cfg.ai.provider === "invalid") {
    return { kind: "not_configured", missing: ["AI_PROVIDER must be anthropic, ollama or template"] };
  }
  if (cfg.ai.provider === "template") {
    return { kind: "not_configured", missing: [], note: "AI_PROVIDER=template selects the template preview on purpose." };
  }
  if (cfg.ai.provider === "ollama") {
    return { kind: "local", model: cfg.ollama.model, baseUrl: cfg.ollama.baseUrl };
  }
  if (cfg.ai.provider === "openai_compatible") {
    const localHost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(cfg.openCompat.baseUrl);
    if (!cfg.openCompat.apiKeyPresent && !localHost) return { kind: "not_configured", missing: ["OPENAI_COMPAT_API_KEY"] };
    return { kind: "open", model: cfg.openCompat.model, host: cfg.openCompat.hostLabel };
  }
  const missing: string[] = [];
  if (!cfg.ai.apiKeyPresent) missing.push("ANTHROPIC_API_KEY");
  if (!cfg.ai.model) missing.push("ANTHROPIC_MODEL");
  if (missing.length) return { kind: "not_configured", missing };
  return { kind: "live", model: cfg.ai.model! };
}

/** Model id of whichever provider is selected (for usage records); null for template. */
export function selectedModel(cfg: AppConfig = config()): string | null {
  const s = aiStatus(cfg);
  return s.kind === "live" || s.kind === "local" || s.kind === "open" ? s.model : null;
}
