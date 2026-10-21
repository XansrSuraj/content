CREATE TABLE "sports_standings" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"competition_code" text NOT NULL,
	"competition_id" text,
	"competition_name" text NOT NULL,
	"season" text,
	"rows" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "standings_provider_comp" ON "sports_standings" USING btree ("provider","competition_code");