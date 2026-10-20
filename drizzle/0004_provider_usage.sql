CREATE TABLE "provider_usage" (
	"provider" text NOT NULL,
	"window" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_usage_window" ON "provider_usage" USING btree ("provider","window");