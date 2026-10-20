import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers";
import type { DB } from "@/lib/db/client";
import { runIngestion } from "@/lib/jobs/ingest";
import { ingestionRuns, sourceObservations, sources } from "@/lib/db/schema";
import { SourceFetchError, type FetchedObservation, type TrendSourceConnector } from "@/lib/providers/trends/types";
import { filterArticle } from "@/lib/providers/trends/wikimedia";
import { extractHashtags } from "@/lib/providers/trends/youtube";
import { comparableMomentum, evidenceConfidence } from "@/lib/domain/opportunities";
import { eq } from "drizzle-orm";

const now = new Date("2026-10-20T06:00:00Z");
const noSleep = async () => {};

function obs(id: string, extra: Partial<FetchedObservation> = {}): FetchedObservation {
  return {
    externalId: id,
    title: id,
    url: null,
    observedAt: new Date("2026-10-19T00:00:00Z"),
    geo: "IN",
    language: "en",
    platform: "wikipedia",
    rank: 1,
    metricName: "views_ceil",
    metricValue: 100,
    coverageNote: "test",
    hashtags: [],
    expiresAt: null,
    ...extra,
  };
}

describe("ingestion job", () => {
  let db: DB;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("stores observations and deduplicates repeated runs", async () => {
    const c: TrendSourceConnector = { key: "test_src", minIntervalMinutes: 60, fetch: async () => [obs("a"), obs("b")] };
    const r1 = await runIngestion(db, c, { trigger: "test", now, sleep: noSleep });
    expect(r1).toMatchObject({ status: "success", itemsFetched: 2, itemsNew: 2 });
    const r2 = await runIngestion(db, c, { trigger: "test", now, force: true, sleep: noSleep });
    expect(r2).toMatchObject({ status: "success", itemsFetched: 2, itemsNew: 0 });
  });

  it("skips when the source was fetched recently (freshness check)", async () => {
    const c: TrendSourceConnector = { key: "test_src", minIntervalMinutes: 60, fetch: async () => [obs("c")] };
    const r = await runIngestion(db, c, { trigger: "test", now: new Date(now.getTime() + 10 * 60_000), sleep: noSleep });
    expect(r.status).toBe("skipped");
  });

  it("retries retryable failures, then records the failure", async () => {
    let calls = 0;
    const c: TrendSourceConnector = {
      key: "flaky_src",
      minIntervalMinutes: 0,
      fetch: async () => {
        calls++;
        throw new SourceFetchError("HTTP 503", true);
      },
    };
    const r = await runIngestion(db, c, { trigger: "test", now, attempts: 3, sleep: noSleep });
    expect(r.status).toBe("failed");
    expect(calls).toBe(3);
    const [src] = await db.select().from(sources).where(eq(sources.key, "flaky_src"));
    expect(src.lastError).toContain("503");
    const runs = await db.select().from(ingestionRuns).where(eq(ingestionRuns.sourceKey, "flaky_src"));
    expect(runs[0]).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("does not retry non-retryable failures", async () => {
    let calls = 0;
    const c: TrendSourceConnector = {
      key: "bad_src",
      minIntervalMinutes: 0,
      fetch: async () => {
        calls++;
        throw new SourceFetchError("HTTP 403", false);
      },
    };
    await runIngestion(db, c, { trigger: "test", now, sleep: noSleep });
    expect(calls).toBe(1);
  });

  it("times out a hanging source", async () => {
    const c: TrendSourceConnector = {
      key: "slow_src",
      minIntervalMinutes: 0,
      fetch: (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    };
    const r = await runIngestion(db, c, { trigger: "test", now, attempts: 1, timeoutMs: 50, sleep: noSleep });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/Timeout|Abort/i);
  });

  it("purges observations past their storage expiry", async () => {
    const c: TrendSourceConnector = {
      key: "expiring_src",
      minIntervalMinutes: 0,
      fetch: async () => [obs("e", { expiresAt: new Date(now.getTime() + 1000) })],
    };
    await runIngestion(db, c, { trigger: "test", now, sleep: noSleep });
    const later = new Date(now.getTime() + 2 * 86_400_000);
    const r = await runIngestion(db, { ...c, fetch: async () => [] }, { trigger: "test", now: later, sleep: noSleep });
    expect(r.purged).toBe(1);
    const left = await db.select().from(sourceObservations).where(eq(sourceObservations.sourceKey, "expiring_src"));
    expect(left).toEqual([]);
  });
});

describe("source parsing and evidence rules", () => {
  it("filters navigation and adult pages from Wikimedia", () => {
    expect(filterArticle("Main_Page")).toBe(false);
    expect(filterArticle("Special:Search")).toBe(false);
    expect(filterArticle(".xxx")).toBe(false);
    expect(filterArticle("XNXX")).toBe(false);
    expect(filterArticle("Speciel:Søgning")).toBe(false);
    expect(filterArticle("Especial:Cerca")).toBe(false);
    expect(filterArticle("Drishyam:_The_Conclusion")).toBe(true);
    expect(filterArticle("Jailer_2")).toBe(true);
  });

  it("extracts hashtags from YouTube titles", () => {
    expect(extractHashtags("New vlog #Travel #travel #हिंदी")).toEqual(["#Travel", "#हिंदी"]);
  });

  it("momentum needs at least two comparable observations", () => {
    const base = { sourceKey: "s", externalId: "x", geo: "IN", platform: "p", retrievedAt: now, isDemo: false };
    expect(comparableMomentum([{ ...base, observedAt: new Date("2026-10-18"), rank: 5 }])).toBeNull();
    const m = comparableMomentum([
      { ...base, observedAt: new Date("2026-10-18"), rank: 9 },
      { ...base, observedAt: new Date("2026-10-19"), rank: 3 },
      // Different geography is not comparable.
      { ...base, geo: "US", observedAt: new Date("2026-10-19"), rank: 1 },
    ]);
    expect(m?.points).toEqual([
      { date: "2026-10-18", rank: 9 },
      { date: "2026-10-19", rank: 3 },
    ]);
  });

  it("confidence reflects evidence, and no evidence means none", () => {
    expect(evidenceConfidence([])).toBe("none");
  });
});
