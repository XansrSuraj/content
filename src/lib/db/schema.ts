import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { EvidenceBundle } from "@/lib/domain/evidence";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ownerId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// ---------- Identity ----------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["creator", "admin"] }).notNull().default("creator"),
  /** Demo accounts are isolated per visitor and only exist while demo mode is enabled. */
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ownerId(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- Creator profile & preferences ----------

export const creatorProfiles = pgTable("creator_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  contentLanguages: jsonb("content_languages").$type<string[]>().notNull().default(["hinglish"]),
  region: text("region").notNull().default("IN"),
  uiLanguage: text("ui_language", { enum: ["hinglish", "english", "hindi"] }).notNull().default("hinglish"),
  defaultTone: text("default_tone").notNull().default("conversational"),
  styleNotes: text("style_notes").notNull().default(""),
  personalExamples: text("personal_examples").notNull().default(""),
  weeklyTimeHours: integer("weekly_time_hours"),
  /** Sports the creator covers, favourite teams (entity ids) and their timezone. */
  sports: jsonb("sports").$type<SportsPrefs>().notNull().default({ sports: [], teamIds: [], timezone: "Asia/Kolkata" }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: ownerId(),
    kind: text("kind", { enum: ["personalize_from_feedback"] }).notNull(),
    granted: boolean("granted").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

// ---------- Sources & observations (trend evidence) ----------

export const sources = pgTable("sources", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** Circuit breaker + lock (shared across instances). */
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLatencyMs: integer("last_latency_ms"),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: id(),
  sourceKey: text("source_key").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "success", "failed", "skipped"] }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  itemsFetched: integer("items_fetched").notNull().default(0),
  itemsNew: integer("items_new").notNull().default(0),
  error: text("error"),
  trigger: text("trigger").notNull().default("manual"),
});

export const sourceObservations = pgTable(
  "source_observations",
  {
    id: id(),
    sourceKey: text("source_key").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    /** The time period / moment the source data describes. */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** When TrendSaathi fetched it. */
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    geo: text("geo").notNull(),
    language: text("language"),
    platform: text("platform").notNull(),
    rank: integer("rank"),
    /** Name of the source-provided metric, e.g. "views_ceil" (never invented). */
    metricName: text("metric_name"),
    metricValue: integer("metric_value"),
    coverageNote: text("coverage_note").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    /** Some sources (YouTube API) require refresh/deletion within a set window. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    index("obs_source_idx").on(t.sourceKey, t.externalId),
    index("obs_observed_idx").on(t.observedAt),
  ],
);

// ---------- Opportunities ----------

export interface CreativeAngle {
  title: string;
  description: string;
}

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["topic", "person", "event", "idea"] }).notNull(),
    group: text("group", { enum: ["timely", "plan", "evergreen"] }).notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    regions: jsonb("regions").$type<string[]>().notNull().default(["IN"]),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    summary: text("summary").notNull(),
    fitReason: text("fit_reason").notNull(),
    angles: jsonb("angles").$type<CreativeAngle[]>().notNull().default([]),
    effort: text("effort", { enum: ["low", "medium", "high"] }).notNull(),
    suggestedHashtags: jsonb("suggested_hashtags").$type<string[]>().notNull().default([]),
    sensitivityNote: text("sensitivity_note"),
    /** Evidence confidence is set by curators/rules from the evidence, not by the model. */
    evidenceConfidence: text("evidence_confidence", { enum: ["low", "medium", "high", "none"] })
      .notNull()
      .default("none"),
    status: text("status", { enum: ["published", "draft", "archived"] }).notNull().default("published"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("opp_status_idx").on(t.status, t.isDemo)],
);

export const opportunityEvidence = pgTable(
  "opportunity_evidence",
  {
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    observationId: text("observation_id")
      .notNull()
      .references(() => sourceObservations.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("opp_evidence_unique").on(t.opportunityId, t.observationId)],
);

// ---------- Caption Studio ----------

export interface SportsPrefs {
  sports: ("cricket" | "football")[];
  teamIds: string[];
  timezone: string;
}

export interface MatchSnapshot {
  id: string;
  provider: string;
  competition: string;
  homeName: string;
  awayName: string;
  startsAt: string;
  stage: "upcoming" | "live" | "completed" | "postponed" | "cancelled" | "unknown";
  statusSource: "provider" | "schedule_only" | "creator";
  statusCheckedAt: string;
  resultSummary: string | null;
  url: string | null;
}

export interface ReferenceSnapshot {
  platform: string;
  topic: string;
  url: string | null;
  evidenceType: "creator_reference" | "tool_observation" | "csv_import";
  sourceTool: string;
  observedAt: string;
}

export interface SportsContextUsed {
  sport: "cricket" | "football" | null;
  teams: string[];
  players: string[];
  contentType: string;
  timeRef: string | null;
  /** The match attached to this answer, as verified at generation time. */
  match: MatchSnapshot | null;
  /** Fixtures that fit equally well — the creator is asked to pick one. */
  candidates: MatchSnapshot[];
  references: ReferenceSnapshot[];
  publishAt: string | null;
  /** One targeted question when the subject itself is unclear (e.g. which "MI"). */
  question?: { kind: string; alias: string | null; options: { id: string; name: string }[] } | null;
}

export interface TrendContextItem {
  title: string;
  sourceKey: string;
  sourceName: string;
  platform: string;
  geo: string;
  observedAt: string;
  metric: string | null;
  url: string | null;
  isDemo: boolean;
  matched: string[];
}

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    userId: ownerId(),
    title: text("title").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    opportunityId: text("opportunity_id"),
    briefId: text("brief_id"),
    isExample: boolean("is_example").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conv_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    text: text("text").notNull().default(""),
    /** Validated CaptionResult JSON for assistant messages. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    /** live_ai | local_ai | template_preview | example — always shown to the user. */
    mode: text("mode", { enum: ["live_ai", "open_model", "local_ai", "template_preview", "example"] }),
    /** Trend observations given to the model as context for this answer (shown to the creator). */
    contextUsed: jsonb("context_used").$type<TrendContextItem[]>(),
    /** Match facts, intent and references given to the model for this answer (shown to the creator). */
    sports: jsonb("sports").$type<SportsContextUsed>(),
    /** Gated evidence bundle (categories kept separate) for this answer. */
    evidence: jsonb("evidence").$type<EvidenceBundle>(),
    createdAt: createdAt(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt)],
);

export const captionVariants = pgTable(
  "caption_variants",
  {
    id: id(),
    userId: ownerId(),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    messageId: text("message_id"),
    platform: text("platform").notNull(),
    label: text("label").notNull(),
    originalText: text("original_text").notNull(),
    text: text("text").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    edited: boolean("edited").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("variant_user_idx").on(t.userId)],
);

// ---------- Briefs ----------

export const briefs = pgTable(
  "briefs",
  {
    id: id(),
    userId: ownerId(),
    opportunityId: text("opportunity_id"),
    topic: text("topic").notNull(),
    platform: text("platform").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    mode: text("mode", { enum: ["live_ai", "open_model", "local_ai", "template_preview", "example"] }).notNull(),
    edited: boolean("edited").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brief_user_idx").on(t.userId)],
);

// ---------- Saved work, published posts, feedback ----------

export const savedItems = pgTable(
  "saved_items",
  {
    id: id(),
    userId: ownerId(),
    kind: text("kind", { enum: ["opportunity", "brief", "variant", "conversation"] }).notNull(),
    refId: text("ref_id").notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_unique").on(t.userId, t.kind, t.refId)],
);

export const publishedPosts = pgTable(
  "published_posts",
  {
    id: id(),
    userId: ownerId(),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    variantId: text("variant_id"),
    briefId: text("brief_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    notes: text("notes").notNull().default(""),
    /** Manually entered by the creator. Never presented as platform data. */
    manualMetrics: jsonb("manual_metrics").$type<Record<string, number>>().notNull().default({}),
    outcome: text("outcome", { enum: ["better", "usual", "worse", "unknown"] }).notNull().default("unknown"),
    createdAt: createdAt(),
  },
  (t) => [index("published_user_idx").on(t.userId)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    userId: ownerId(),
    targetType: text("target_type", { enum: ["opportunity", "brief", "variant", "conversation"] }).notNull(),
    targetId: text("target_id").notNull(),
    verdict: text("verdict", { enum: ["useful", "not_useful", "rejected"] }).notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_user_idx").on(t.userId)],
);

/** First-party workflow events. Payloads hold ids and enums only, never caption text. */
export const events = pgTable(
  "events",
  {
    id: id(),
    userId: ownerId(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_user_idx").on(t.userId, t.type)],
);

// ---------- Cost & abuse controls ----------

export const usageRecords = pgTable(
  "usage_records",
  {
    id: id(),
    userId: ownerId(),
    kind: text("kind", { enum: ["caption", "brief", "angles"] }).notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status", { enum: ["ok", "error", "rejected"] }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_user_idx").on(t.userId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

// ---------- Sports fixtures (shared: fetched once per match, used by every creator) ----------

export const sportsMatches = pgTable(
  "sports_matches",
  {
    id: id(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    sport: text("sport", { enum: ["cricket", "football"] }).notNull(),
    competition: text("competition").notNull(),
    gender: text("gender", { enum: ["men", "women"] }).notNull().default("men"),
    homeTeamId: text("home_team_id"),
    awayTeamId: text("away_team_id"),
    homeName: text("home_name").notNull(),
    awayName: text("away_name").notNull(),
    /** Always UTC; shown in the creator's timezone. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["scheduled", "live", "finished", "postponed", "cancelled", "unknown"] }).notNull(),
    /** provider = live status feed; schedule_only = fixture list without live status; creator = entered by a creator. */
    statusSource: text("status_source", { enum: ["provider", "schedule_only", "creator"] }).notNull(),
    statusCheckedAt: timestamp("status_checked_at", { withTimezone: true }).notNull(),
    resultSummary: text("result_summary"),
    url: text("url"),
    /** Canonical match fields (spec phase 1). */
    competitionId: text("competition_id"),
    season: text("season"),
    /** men | women | youth | other (gender is kept for older code). */
    category: text("category"),
    venue: text("venue"),
    /** Every provider's id for this match, e.g. {"football_data": "123", "openligadb": "456"}. */
    providerIds: jsonb("provider_ids").$type<Record<string, string>>().notNull().default({}),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    /** Last time a provider with live status confirmed this status. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** fixtures | status | final — how long this row's data stays trustworthy. */
    freshnessPolicy: text("freshness_policy"),
    /** Creator-entered fixtures are private to that creator; provider fixtures are shared (null). */
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("match_provider_ext").on(t.provider, t.externalId), index("match_sport_start").on(t.sport, t.startsAt)],
);

// ---------- Platform references (evidence a person saw in a platform tool) ----------

export const platformReferences = pgTable(
  "platform_references",
  {
    id: id(),
    /** Null = shared (entered by an admin); otherwise private to the creator who added it. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    topic: text("topic").notNull(),
    region: text("region").notNull().default("IN"),
    url: text("url"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** creator_reference = a creator pasted it; tool_observation = admin read it in a platform tool; csv_import = admin imported an export. */
    evidenceType: text("evidence_type", { enum: ["creator_reference", "tool_observation", "csv_import"] }).notNull(),
    sourceTool: text("source_tool").notNull(),
    note: text("note").notNull().default(""),
    value: integer("value"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("ref_user_idx").on(t.userId), index("ref_observed_idx").on(t.observedAt)],
);

// ---------- Sports entities (mirrors src/lib/domain/sports/seed; synced on every migrate) ----------

export const sportsCatalog = pgTable("sports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const sportsCompetitions = pgTable("competitions", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),
  name: text("name").notNull(),
  format: text("format").notNull(),
  /** men | women | youth | other */
  category: text("category").notNull(),
  season: text("season"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sportsTeams = pgTable("teams", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),
  name: text("name").notNull(),
  short: text("short").notNull(),
  kind: text("kind").notNull(),
  category: text("category").notNull(),
  competitions: jsonb("competitions").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sportsPlayers = pgTable("players", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entityAliases = pgTable(
  "entity_aliases",
  {
    id: id(),
    alias: text("alias").notNull(),
    /** latin | deva */
    script: text("script").notNull(),
    entityType: text("entity_type", { enum: ["team", "player", "competition"] }).notNull(),
    /** For ambiguous aliases: one row per candidate entity. */
    entityId: text("entity_id").notNull(),
    /** Weak = also an everyday word; counts only with a sports signal. */
    weak: boolean("weak").notNull().default(false),
    /** The alias points at several entities and needs context or the creator to decide. */
    ambiguous: boolean("ambiguous").notNull().default(false),
  },
  (t) => [uniqueIndex("alias_entity_unique").on(t.alias, t.entityType, t.entityId), index("alias_lookup").on(t.alias)],
);

// ---------- Provider quota ledger (shared budgets for free tiers) ----------

export const providerUsage = pgTable(
  "provider_usage",
  {
    provider: text("provider").notNull(),
    /** "d:YYYY-MM-DD" (UTC day) or "m:YYYY-MM-DDTHH:MM" (UTC minute). */
    window: text("window").notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [uniqueIndex("provider_usage_window").on(t.provider, t.window)],
);

// ---------- League tables (shared, from live-status providers) ----------

export interface StandingRow {
  position: number;
  team: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
  points: number;
}

export const sportsStandings = pgTable(
  "sports_standings",
  {
    id: id(),
    provider: text("provider").notNull(),
    competitionCode: text("competition_code").notNull(),
    competitionId: text("competition_id"),
    competitionName: text("competition_name").notNull(),
    season: text("season"),
    rows: jsonb("rows").$type<StandingRow[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("standings_provider_comp").on(t.provider, t.competitionCode)],
);
