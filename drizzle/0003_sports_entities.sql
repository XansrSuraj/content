CREATE TABLE "entity_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"script" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"weak" boolean DEFAULT false NOT NULL,
	"ambiguous" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"category" text NOT NULL,
	"season" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"competitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "competition_id" text;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "season" text;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "provider_ids" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD COLUMN "freshness_policy" text;--> statement-breakpoint
CREATE UNIQUE INDEX "alias_entity_unique" ON "entity_aliases" USING btree ("alias","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "alias_lookup" ON "entity_aliases" USING btree ("alias");