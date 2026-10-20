ALTER TABLE "sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_latency_ms" integer;