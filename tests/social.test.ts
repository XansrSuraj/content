import { afterEach, describe, expect, it, vi } from "vitest";
import { BlueskyTrendsConnector, MastodonTrendingTagsConnector } from "@/lib/providers/trends/social";
import { AppleChartConnector } from "@/lib/providers/trends/apple-music";
import { SourceFetchError } from "@/lib/providers/trends/types";
import { readConfig } from "@/lib/config";
import { sourceStatus } from "@/lib/providers/trends/catalog";
import { runIngestion } from "@/lib/jobs/ingest";
import { latestBatch } from "@/lib/services/trend-context";
import { createTestDb } from "./helpers";

const now = new Date("2026-10-20T12:30:00Z");
afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn<(url: string | URL | Request) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const BLUESKY = {
  trends: [
    { topic: "a1", displayName: "World Cup final", link: "/profile/x/feed/a1", postCount: 1200, status: "hot", category: "sports" },
    { topic: "a2", displayName: "porn leak", postCount: 50 },
    { topic: "a3", displayName: "Stadium attack", postCount: 900 },
  ],
};

describe("Bluesky trending topics", () => {
  it("maps topics with post counts, filters adult titles, labels worldwide", async () => {
    stubFetch(BLUESKY);
    const rows = await new BlueskyTrendsConnector("UA").fetch(AbortSignal.timeout(1000), now);
    expect(rows.map((r) => r.title)).toEqual(["World Cup final", "Stadium attack"]);
    expect(rows[0]).toMatchObject({ url: "https://bsky.app/profile/x/feed/a1", metricName: "bluesky_posts", metricValue: 1200, geo: "WORLD", hashtags: [] });
    expect(rows[0].coverageNote).toMatch(/not Instagram, YouTube or Indian audiences/);
  });

  it("rejects an unexpected shape", async () => {
    stubFetch({ topics: [] });
    await expect(new BlueskyTrendsConnector("UA").fetch(AbortSignal.timeout(1000), now)).rejects.toBeInstanceOf(SourceFetchError);
  });

  it("hides violence/tragedy titles from the displayed batch", async () => {
    const db = await createTestDb();
    stubFetch(BLUESKY);
    await runIngestion(db, new BlueskyTrendsConnector("UA"), { trigger: "test", now });
    expect((await latestBatch(db, "bluesky_trends")).map((b) => [b.title, b.metric])).toEqual([["World Cup final", "1,200 Bluesky posts"]]);
  });
});

describe("Mastodon trending hashtags", () => {
  it("uses today's count and never stores hashtag evidence", async () => {
    stubFetch([
      { name: "TuneTuesday", url: "https://mastodon.social/tags/tunetuesday", history: [{ day: "1", uses: "101", accounts: "75" }] },
    ]);
    const [row] = await new MastodonTrendingTagsConnector("UA").fetch(AbortSignal.timeout(1000), now);
    expect(row).toMatchObject({ title: "#TuneTuesday", metricName: "mastodon_uses_today", metricValue: 101, hashtags: [], platform: "mastodon" });
  });
});

describe("Apple Podcasts India", () => {
  it("uses the podcasts chart URL and key", async () => {
    const fetchFn = stubFetch({ feed: { updated: "Tue, 20 Oct 2026 11:00:00 +0000", results: [{ id: "9", name: "Show", artistName: "Host" }] } });
    const c = new AppleChartConnector("UA", "podcasts");
    const rows = await c.fetch(AbortSignal.timeout(1000), now);
    expect(c.key).toBe("apple_podcasts_top_in");
    expect(String(fetchFn.mock.calls[0][0])).toContain("/in/podcasts/top/50/podcasts.json");
    expect(rows[0]).toMatchObject({ title: "Show — Host", platform: "apple_podcasts", rank: 1 });
  });
});

describe("new keyless sources", () => {
  it("are on by default and can each be turned off", () => {
    const on = readConfig({} as unknown as NodeJS.ProcessEnv);
    for (const key of ["apple_podcasts_top_in", "bluesky_trends", "mastodon_trending_tags"]) expect(sourceStatus(key, on).status).toBe("enabled");
    const off = readConfig({
      SOURCE_APPLE_PODCASTS_ENABLED: "false",
      SOURCE_BLUESKY_ENABLED: "false",
      SOURCE_MASTODON_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    for (const key of ["apple_podcasts_top_in", "bluesky_trends", "mastodon_trending_tags"]) expect(sourceStatus(key, off).status).toBe("disabled");
  });
});
