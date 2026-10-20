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
