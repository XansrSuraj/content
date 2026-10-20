import { beforeAll, describe, expect, it } from "vitest";
import { aiStatus, readConfig } from "@/lib/config";
import { checkAiQuota, consumeLimit } from "@/lib/security/rate-limit";
import { createTestDb, createUser } from "./helpers";
import type { DB } from "@/lib/db/client";
import { ensureDemoCatalog } from "@/lib/demo/seed";
import { getOpportunity, listOpportunities } from "@/lib/repo/discovery";
import { sourceStatus } from "@/lib/providers/trends/catalog";

describe("rate limits", () => {
  let db: DB;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("blocks after the limit within the window and resets after", async () => {
    const t0 = new Date("2026-10-20T10:00:00Z");
    for (let i = 0; i < 3; i++) expect((await consumeLimit(db, "k", 3, 60_000, t0)).allowed).toBe(true);
    const blocked = await consumeLimit(db, "k", 3, 60_000, new Date(t0.getTime() + 1000));
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await consumeLimit(db, "k", 3, 60_000, new Date(t0.getTime() + 61_000))).allowed).toBe(true);
  });

  it("per-user AI quota is independent between users", async () => {
    const a = await createUser(db, "qa@example.com");
    const b = await createUser(db, "qb@example.com");
    const limits = { perMinute: 2, perDay: 100 };
    const t = new Date("2026-10-20T11:00:00Z");
    expect((await checkAiQuota(db, a.id, limits, t)).ok).toBe(true);
    expect((await checkAiQuota(db, a.id, limits, t)).ok).toBe(true);
    expect(await checkAiQuota(db, a.id, limits, t)).toMatchObject({ ok: false, reason: "minute" });
    expect((await checkAiQuota(db, b.id, limits, t)).ok).toBe(true);
  });
});

describe("demo / live separation", () => {
  it("demo is on by default only outside production", () => {
    expect(readConfig({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv).demoEnabled).toBe(true);
    expect(readConfig({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv).demoEnabled).toBe(false);
  });

  it("production ignores TRENDSAATHI_DEMO_MODE unless explicitly allowed", () => {
    expect(readConfig({ NODE_ENV: "production", TRENDSAATHI_DEMO_MODE: "true" } as unknown as NodeJS.ProcessEnv).demoEnabled).toBe(false);
    expect(
      readConfig({ NODE_ENV: "production", TRENDSAATHI_DEMO_MODE: "true", TRENDSAATHI_ALLOW_DEMO_IN_PRODUCTION: "true" } as unknown as NodeJS.ProcessEnv).demoEnabled,
    ).toBe(true);
  });

  it("AI status reports exactly what is missing", () => {
    expect(aiStatus(readConfig({} as unknown as NodeJS.ProcessEnv))).toEqual({ kind: "not_configured", missing: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] });
    expect(aiStatus(readConfig({ ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv))).toEqual({ kind: "not_configured", missing: ["ANTHROPIC_MODEL"] });
    expect(aiStatus(readConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "m" } as unknown as NodeJS.ProcessEnv))).toEqual({ kind: "live", model: "m" });
  });

  it("source status never claims a connection that is not configured", () => {
    const cfg = readConfig({} as unknown as NodeJS.ProcessEnv);
    expect(sourceStatus("youtube_most_popular_in", cfg).status).toBe("needs_config");
    // Keyless sources are on by default and say so; keyed ones need their key.
    expect(sourceStatus("wikimedia_top_in", cfg).status).toBe("enabled");
    expect(sourceStatus("apple_music_top_in", cfg).status).toBe("enabled");
    expect(sourceStatus("wikimedia_top_in", readConfig({ SOURCE_WIKIMEDIA_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).status).toBe("disabled");
    expect(sourceStatus("instagram_hashtag", cfg).status).toBe("unavailable");
    expect(sourceStatus("trending_audio", cfg).status).toBe("unavailable");
  });

  it("demo opportunities never appear in the observed dataset", async () => {
    const db = await createTestDb();
    await ensureDemoCatalog(db);
    const demo = await listOpportunities(db, { dataset: "demo" });
    expect(demo.length).toBeGreaterThan(5);
    expect(await listOpportunities(db, { dataset: "observed" })).toEqual([]);
    expect(await getOpportunity(db, demo[0].id, "observed")).toBeNull();
    // Re-seeding is idempotent and keeps stable ids.
    await ensureDemoCatalog(db, new Date(Date.now() + 2 * 86_400_000));
    expect((await getOpportunity(db, demo[0].id, "demo"))?.id).toBe(demo[0].id);
  });
});
