CREATE TABLE "platform_references" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"topic" text NOT NULL,
	"region" text DEFAULT 'IN' NOT NULL,
	"url" text,
	"observed_at" timestamp with time zone NOT NULL,
	"evidence_type" text NOT NULL,
	"source_tool" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"sport" text NOT NULL,
	"competition" text NOT NULL,
	"gender" text DEFAULT 'men' NOT NULL,
	"home_team_id" text,
	"away_team_id" text,
	"home_name" text NOT NULL,
	"away_name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"status_source" text NOT NULL,
	"status_checked_at" timestamp with time zone NOT NULL,
	"result_summary" text,
	"url" text,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "sports" jsonb DEFAULT '{"sports":[],"teamIds":[],"timezone":"Asia/Kolkata"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sports" jsonb;--> statement-breakpoint
ALTER TABLE "platform_references" ADD CONSTRAINT "platform_references_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_matches" ADD CONSTRAINT "sports_matches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ref_user_idx" ON "platform_references" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ref_observed_idx" ON "platform_references" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_provider_ext" ON "sports_matches" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "match_sport_start" ON "sports_matches" USING btree ("sport","starts_at");