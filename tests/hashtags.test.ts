import { beforeAll, describe, expect, it } from "vitest";
import { classifyHashtags, hashtagsForCopy, normalizeHashtag, type HashtagEvidence } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import { createTestDb } from "./helpers";
import type { DB } from "@/lib/db/client";
import { sourceObservations } from "@/lib/db/schema";
import { hashtagEvidence } from "@/lib/repo/discovery";

const now = new Date("2026-10-20T12:00:00Z");

function ev(p: Partial<HashtagEvidence>): HashtagEvidence {
  return {
    sourceKey: "youtube_most_popular_in",
    sourceName: "YouTube Most Popular chart (India)",
    platform: "youtube",
    geo: "IN",
    observedAt: new Date("2026-10-20T08:00:00Z"),
    retrievedAt: new Date("2026-10-20T08:00:00Z"),
    coverageNote: "sample",
    url: null,
    isDemo: false,
    ...p,
  };
}

describe("verified trend status requires evidence", () => {
  it("defaults to suggested when there is no evidence (model output can't verify)", () => {
    const res = classifyHashtags(["#Viral", "#Trending"], new Map(), "youtube_shorts", now);
    expect(res.every((r) => r.status === "suggested")).toBe(true);
  });

  it("verifies only with fresh, non-demo evidence for the same platform family", () => {
    const map = new Map([["#mobilefilmmaking", [ev({})]]]);
    expect(classifyHashtags(["#MobileFilmmaking"], map, "youtube_shorts", now)[0].status).toBe("verified");
    // YouTube evidence does not verify an Instagram hashtag.
    expect(classifyHashtags(["#MobileFilmmaking"], map, "instagram_reels", now)[0].status).toBe("suggested");
  });

  it("does not treat search-interest (Wikipedia) evidence as social hashtag evidence", () => {
    const map = new Map([["#cricket", [ev({ sourceKey: "wikimedia_top_in", platform: "wikipedia" })]]]);
    expect(classifyHashtags(["#Cricket"], map, "instagram_reels", now)[0].status).toBe("suggested");
    expect(classifyHashtags(["#Cricket"], map, "youtube", now)[0].status).toBe("suggested");
  });

  it("stale evidence does not verify", () => {
    const map = new Map([["#old", [ev({ observedAt: new Date("2026-10-10T00:00:00Z") })]]]);
    expect(classifyHashtags(["#old"], map, "youtube", now)[0].status).toBe("suggested");
  });

  it("demo evidence is labeled demo, never verified", () => {
    const map = new Map([["#demo", [ev({ isDemo: true, sourceKey: "demo_sample" })]]]);
    expect(classifyHashtags(["#demo"], map, "youtube", now)[0].status).toBe("demo");
  });

  it("evidence lacking geo/timestamps does not verify", () => {
    const map = new Map([["#x", [ev({ geo: "" })]]]);
    expect(classifyHashtags(["#x"], map, "youtube", now)[0].status).toBe("suggested");
  });
});

describe("hashtag helpers", () => {
  it("normalizes, including Devanagari", () => {
    expect(normalizeHashtag("##Tech Hindi!")).toBe("#TechHindi");
    expect(normalizeHashtag("#हिंदी_टेक")).toBe("#हिंदी_टेक");
    expect(normalizeHashtag("   ")).toBe("");
  });

  it("one-click copy respects configured platform limits", () => {
    const tags = ["#a", "#b", "#c", "#d", "#e", "#f", "#a"];
    const yt = getPlatform("youtube_shorts").hashtagRule;
    expect(hashtagsForCopy(tags, yt.copyDefault, yt.hardLimit)).toEqual(["#a", "#b", "#c"]);
    const ig = getPlatform("instagram_reels").hashtagRule;
    expect(hashtagsForCopy(tags, ig.copyDefault, ig.hardLimit).length).toBeLessThanOrEqual(ig.hardLimit!);
  });
});

describe("hashtag evidence lookup from stored observations", () => {
  let db: DB;
  beforeAll(async () => {
    db = await createTestDb();
    const base = {
      sourceKey: "youtube_most_popular_in",
      externalId: "vid1",
      title: "t",
      observedAt: new Date(),
      retrievedAt: new Date(),
      geo: "IN",
      platform: "youtube",
      coverageNote: "sample",
    };
    await db.insert(sourceObservations).values([
      { ...base, dedupeKey: "a", hashtags: ["#RealTag"], isDemo: false },
      { ...base, dedupeKey: "b", externalId: "vid2", hashtags: ["#DemoTag"], isDemo: true },
    ]);
  });

  it("excludes demo evidence for real users and includes it (labeled) for demo users", async () => {
    const real = await hashtagEvidence(db, ["#realtag", "#demotag"], false);
    expect(real.has("#realtag")).toBe(true);
    expect(real.has("#demotag")).toBe(false);
    const demo = await hashtagEvidence(db, ["#demotag"], true);
    expect(demo.get("#demotag")?.[0].isDemo).toBe(true);
  });

  it("ignores unsafe tag strings instead of building SQL from them", async () => {
    const res = await hashtagEvidence(db, ["#x'); drop table users; --"], false);
    expect(res.size).toBe(0);
  });
});
