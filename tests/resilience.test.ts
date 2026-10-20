import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { acquireLock, backoffMs, pauseMs, releaseLock, FAILURES_TO_PAUSE } from "@/lib/jobs/guard";
import { runIngestion } from "@/lib/jobs/ingest";
import { sourceObservations, sources } from "@/lib/db/schema";
import { RateLimitedError, type FetchedObservation, type TrendSourceConnector } from "@/lib/providers/trends/types";
import { trendingNow } from "@/lib/services/trend-context";
import { listMessages } from "@/lib/repo/studio";
import { runCaptionTurn } from "@/lib/services/captions";
import { CaptionResultSchema } from "@/lib/domain/captions";
import type { CaptionProvider } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleModelOutput } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());
const t0 = new Date("2026-10-21T06:00:00Z");
const noSleep = async () => undefined;

const obs = (title: string, now: Date): FetchedObservation => ({
  externalId: title, title, url: null, observedAt: now, geo: "IN", language: null, platform: "google_search", rank: 1,
  metricName: null, metricValue: null, coverageNote: "x", hashtags: [], expiresAt: null,
});

function connector(key: string, impl: (n: number) => Promise<FetchedObservation[]>): TrendSourceConnector & { calls: number } {
  const c = { key, minIntervalMinutes: 0, calls: 0, fetch: async () => impl(++c.calls) };
  return c;
}

describe("guard primitives", () => {
  it("backs off exponentially with ±50% jitter", () => {
    expect(backoffMs(1, 500, () => 0)).toBe(250);
    expect(backoffMs(1, 500, () => 1)).toBe(750);
    expect(backoffMs(3, 500, () => 0.5)).toBe(2000);
  });
  it("opens the circuit after repeated failures, doubling up to a cap", () => {
    expect(pauseMs(FAILURES_TO_PAUSE - 1)).toBe(0);
    expect(pauseMs(FAILURES_TO_PAUSE)).toBe(30 * 60_000);
    expect(pauseMs(FAILURES_TO_PAUSE + 1)).toBe(60 * 60_000);
    expect(pauseMs(50)).toBe(6 * 3_600_000);
  });
  it("lock blocks a second concurrent refresh until released", async () => {
    const db = await createTestDb();
    await db.insert(sources).values({ key: "k", name: "k" });
    expect(await acquireLock(db, "k", 60_000, t0)).toBe(true);
    expect(await acquireLock(db, "k", 60_000, t0)).toBe(false);
    expect(await acquireLock(db, "k", 60_000, new Date(t0.getTime() + 61_000))).toBe(true); // expired lock
    await releaseLock(db, "k");
    expect(await acquireLock(db, "k", 60_000, t0)).toBe(true);
  });
});

describe("ingestion resilience", () => {
  it("pauses after 3 failures, skips while paused, and resets on success", async () => {
    const db = await createTestDb();
    let fail = true;
    const c = connector("google_trends_rss_in", async () => {
      if (fail) throw new Error("boom");
      return [obs("x", t0)];
    });
    for (let i = 0; i < 3; i++) await runIngestion(db, c, { trigger: "test", now: new Date(t0.getTime() + i * 60_000), attempts: 1, sleep: noSleep });
    const [row] = await db.select().from(sources).where(eq(sources.key, c.key));
    expect(row.consecutiveFailures).toBe(3);
    expect(row.pausedUntil!.getTime()).toBeGreaterThan(t0.getTime());
    const callsBefore = c.calls;
    expect((await runIngestion(db, c, { trigger: "test", now: new Date(t0.getTime() + 5 * 60_000), sleep: noSleep })).error).toMatch(/Paused/);
    expect(c.calls).toBe(callsBefore);
    fail = false;
    const later = new Date(row.pausedUntil!.getTime() + 1000);
    expect((await runIngestion(db, c, { trigger: "test", now: later, sleep: noSleep })).status).toBe("success");
    const [after] = await db.select().from(sources).where(eq(sources.key, c.key));
    expect(after.consecutiveFailures).toBe(0);
    expect(after.pausedUntil).toBeNull();
  });

  it("a 429 is not retried and pauses for exactly its Retry-After", async () => {
    const db = await createTestDb();
    const c = connector("google_trends_rss_in", async () => {
      throw new RateLimitedError(600);
    });
    const res = await runIngestion(db, c, { trigger: "test", now: t0, attempts: 3, sleep: noSleep });
    expect(res.status).toBe("failed");
    expect(c.calls).toBe(1);
    const [row] = await db.select().from(sources).where(eq(sources.key, c.key));
    expect(row.pausedUntil!.getTime()).toBe(t0.getTime() + 600_000);
  });

  it("times out a hanging source and keeps the last good data", async () => {
    const db = await createTestDb();
    const good = connector("google_trends_rss_in", async () => [obs("kept", t0)]);
    await runIngestion(db, good, { trigger: "test", now: t0, sleep: noSleep });
    const hang = connector("google_trends_rss_in", () => new Promise<FetchedObservation[]>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })), 20)));
    const res = await runIngestion(db, hang, { trigger: "test", now: new Date(t0.getTime() + 60_000), attempts: 2, timeoutMs: 10, sleep: noSleep });
    expect(res.status).toBe("failed");
    expect(hang.calls).toBe(2); // timeouts are retried
    expect((await db.select().from(sourceObservations)).map((o) => o.title)).toEqual(["kept"]);
  });

  it("one source failing does not stop the others", async () => {
    const db = await createTestDb();
    const broken = connector("google_trends_rss_in", async () => {
      throw new Error("down");
    });
    const fine = connector("wikimedia_top_in", async () => [obs("wiki item", t0)]);
    const [a, b] = await Promise.all([
      runIngestion(db, broken, { trigger: "test", now: t0, attempts: 1, sleep: noSleep }),
      runIngestion(db, fine, { trigger: "test", now: t0, sleep: noSleep }),
    ]);
    expect([a.status, b.status]).toEqual(["failed", "success"]);
  });
});

describe("requests never wait on external sources", () => {
  it("the Trending page reads cached data only", async () => {
    const db = await createTestDb();
    const fetchSpy = vi.fn(async () => {
      throw new Error("no network in page requests");
    });
    vi.stubGlobal("fetch", fetchSpy);
    await trendingNow(db);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("user isolation", () => {
  it("user B can never read user A's generations or evidence", async () => {
    const db = await createTestDb();
    const a = await createUser(db, "iso-a@example.com");
    const b = await createUser(db, "iso-b@example.com");
    const provider: CaptionProvider = {
      name: "rec",
      async generate() {
        return { data: CaptionResultSchema.parse(sampleModelOutput()), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    const res = await runCaptionTurn(db, a, { conversationId: null, message: "RCB vs MI preview", opportunityId: null }, provider);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await listMessages(db, a.id, res.value.conversationId)).length).toBe(2);
    expect(await listMessages(db, b.id, res.value.conversationId)).toEqual([]);
    const other = await runCaptionTurn(db, b, { conversationId: res.value.conversationId, message: "hi", opportunityId: null }, provider);
    expect(other).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });
});
