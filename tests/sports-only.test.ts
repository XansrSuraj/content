import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { opportunities, sourceObservations } from "@/lib/db/schema";
import { ensureDemoCatalog } from "@/lib/demo/seed";
import { listOpportunities } from "@/lib/repo/discovery";
import { latestBatch, trendingNow } from "@/lib/services/trend-context";
import { createTestDb } from "./helpers";

const now = new Date("2026-10-21T06:00:00Z");

function obs(sourceKey: string, title: string, rank: number) {
  return {
    sourceKey,
    dedupeKey: `${sourceKey}|${title}`,
    externalId: title,
    title,
    url: null,
    observedAt: new Date(now.getTime() - 3_600_000),
    retrievedAt: now,
    geo: "IN",
    language: null,
    platform: "web",
    rank,
    metricName: null,
    metricValue: null,
    coverageNote: "test",
    hashtags: [],
    isDemo: false,
  };
}

describe("sports-only product", () => {
  it("Trending keeps sports titles and counts the rest", async () => {
    const db = await createTestDb();
    await db.insert(sourceObservations).values([
      obs("google_trends_rss_in", "Virat Kohli", 1),
      obs("google_trends_rss_in", "Diwali sale 2026", 2),
      obs("google_trends_rss_in", "ind vs aus", 3),
      obs("wikimedia_top_in", "Bigg Boss (Hindi TV series) season 20", 1),
    ]);
    const { items, otherTopics } = await trendingNow(db, now);
    expect(items.map((i) => i.title)).toEqual(["Virat Kohli", "ind vs aus"]);
    expect(otherTopics).toBe(2);
  });

  it("chart lists can be limited to sports", async () => {
    const db = await createTestDb();
    await db.insert(sourceObservations).values([obs("bluesky_trends", "Champions League", 1), obs("bluesky_trends", "New phone launch", 2)]);
    expect((await latestBatch(db, "bluesky_trends", 10, { sportsOnly: true })).map((b) => b.title)).toEqual(["Champions League"]);
    expect(await latestBatch(db, "bluesky_trends", 10)).toHaveLength(2);
  });

  it("demo ideas are all sports, and older non-sports demo ideas are archived", async () => {
    const db = await createTestDb();
    await db.insert(opportunities).values({
      id: "demo-opp-old-tech",
      title: "Old tech idea",
      kind: "topic",
      group: "plan",
      categories: ["tech"],
      languages: ["hinglish"],
      regions: ["IN"],
      platforms: ["instagram_reels"],
      summary: "s",
      fitReason: "f",
      angles: [],
      effort: "low",
      suggestedHashtags: [],
      evidenceConfidence: "none",
      status: "published",
      isDemo: true,
    });
    await ensureDemoCatalog(db, now);
    const [old] = await db.select().from(opportunities).where(eq(opportunities.id, "demo-opp-old-tech"));
    expect(old.status).toBe("archived");
    const demo = await listOpportunities(db, { dataset: "demo" });
    expect(demo.length).toBeGreaterThan(5);
    expect(demo.every((o) => o.categories.includes("sports"))).toBe(true);
  });
});
