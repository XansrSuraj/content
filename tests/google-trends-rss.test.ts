import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleTrendsRssConnector,
  decodeXml,
  parseTrafficBucket,
  parseTrendingRss,
} from "@/lib/providers/trends/google-trends-rss";
import { SourceFetchError } from "@/lib/providers/trends/types";
import { runIngestion } from "@/lib/jobs/ingest";
import { classifyHashtags } from "@/lib/domain/hashtags";
import { readConfig } from "@/lib/config";
import { sourceStatus } from "@/lib/providers/trends/catalog";
import { createTestDb } from "./helpers";

const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixtures", "google-trends-in.xml"), "utf8");
const now = new Date("2026-10-20T12:30:00Z");

afterEach(() => vi.unstubAllGlobals());

describe("Google Trends RSS parsing", () => {
  it("parses items, entities, CDATA and Devanagari", () => {
    const items = parseTrendingRss(FIXTURE);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ title: "ranji trophy", approxTraffic: "2,000+", newsSource: "Example News" });
    expect(items[0].pubDate?.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(items[1].title).toBe("बंबई स्टॉक एक्सचेंज");
    expect(items[2].title).toBe("xnxx");
    expect(decodeXml("A &amp; B &#x263A; &#65;")).toBe("A & B ☺ A");
  });

  it("parses Google's traffic buckets as lower bounds", () => {
    expect(parseTrafficBucket("200+")).toBe(200);
    expect(parseTrafficBucket("2,000+")).toBe(2000);
    expect(parseTrafficBucket("10K+")).toBe(10_000);
    expect(parseTrafficBucket("1M+")).toBe(1_000_000);
    expect(parseTrafficBucket("lots")).toBeNull();
    expect(parseTrafficBucket(null)).toBeNull();
  });

  it("rejects documents that are not the feed (e.g. a consent or error page)", () => {
    expect(() => parseTrendingRss("<html><body>Before you continue</body></html>")).toThrow(SourceFetchError);
  });
});

describe("Google Trends RSS connector", () => {
  it("fetches anonymously, filters unsafe titles, labels search interest and never adds hashtags", async () => {
    const fetchMock = vi.fn(async () => new Response(FIXTURE, { status: 200, headers: { "content-type": "text/xml" } }));
    vi.stubGlobal("fetch", fetchMock);
    const obs = await new GoogleTrendsRssConnector("TrendSaathi-test/0.1").fetch(AbortSignal.timeout(5000), now);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://trends.google.com/trending/rss?geo=IN");
    expect(init.credentials).toBe("omit");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("TrendSaathi-test/0.1");

    expect(obs.map((o) => o.title)).toEqual(["ranji trophy", "बंबई स्टॉक एक्सचेंज", "future dated item"]);
    const first = obs[0];
    expect(first).toMatchObject({ geo: "IN", platform: "google_search", rank: 1, metricName: "approx_traffic", metricValue: 2000, hashtags: [] });
    expect(first.observedAt.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(first.expiresAt!.getTime() - now.getTime()).toBe(7 * 86_400_000);
    expect(first.coverageNote).toMatch(/Search interest only, not social-media or hashtag popularity/);
    expect(first.coverageNote).toMatch(/Data source: Google Trends/);
    expect(first.coverageNote).toMatch(/2,000\+/);
    // A future-dated pubDate is not trusted; retrieval time is used instead.
    expect(obs[2].observedAt.toISOString()).toBe(now.toISOString());
  });

  it("maps HTTP errors to retryable vs permanent failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(new GoogleTrendsRssConnector("ua").fetch(AbortSignal.timeout(5000), now)).rejects.toMatchObject({ retryable: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    await expect(new GoogleTrendsRssConnector("ua").fetch(AbortSignal.timeout(5000), now)).rejects.toMatchObject({ retryable: false });
  });

  it("ingests with dedupe and expiry through the shared job runner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FIXTURE, { status: 200 })));
    const db = await createTestDb();
    const c = new GoogleTrendsRssConnector("ua");
    const r1 = await runIngestion(db, c, { trigger: "test", now, sleep: async () => {} });
    expect(r1).toMatchObject({ status: "success", itemsFetched: 3, itemsNew: 3 });
    const r2 = await runIngestion(db, c, { trigger: "test", now, force: true, sleep: async () => {} });
    expect(r2.itemsNew).toBe(0);
    const later = await runIngestion(db, { ...c, key: c.key, minIntervalMinutes: 0, fetch: async () => [] }, {
      trigger: "test",
      now: new Date(now.getTime() + 8 * 86_400_000),
      sleep: async () => {},
    });
    expect(later.purged).toBe(3);
  });

  it("search-interest evidence can never verify a social hashtag", () => {
    const ev = new Map([
      [
        "#ranjitrophy",
        [{ sourceKey: "google_trends_rss_in", sourceName: "Google", platform: "google_search", geo: "IN", observedAt: now, retrievedAt: now, coverageNote: "x", url: null, isDemo: false }],
      ],
    ]);
    for (const p of ["instagram_reels", "youtube_shorts", "facebook_reels", "tiktok"]) {
      expect(classifyHashtags(["#RanjiTrophy"], ev, p, now)[0].status).toBe("suggested");
    }
  });

  it("is on by default, needs no key, and can be turned off", () => {
    expect(sourceStatus("google_trends_rss_in", readConfig({} as unknown as NodeJS.ProcessEnv)).status).toBe("enabled");
    expect(
      sourceStatus("google_trends_rss_in", readConfig({ SOURCE_GOOGLE_TRENDS_RSS_ENABLED: "false" } as unknown as NodeJS.ProcessEnv)).status,
    ).toBe("disabled");
    // Unit tests never hit the network: keyless sources default off under NODE_ENV=test.
    expect(sourceStatus("google_trends_rss_in", readConfig({ NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv)).status).toBe("disabled");
  });
});
