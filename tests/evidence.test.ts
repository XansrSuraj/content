import { describe, expect, it } from "vitest";
import { gateEvidence, relatedEntities, type EvidenceItem, type GateContext } from "@/lib/domain/evidence";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { buildEvidence } from "@/lib/services/evidence";
import { sourceObservations } from "@/lib/db/schema";
import { addReferences } from "@/lib/repo/sports";
import { createTestDb, createUser } from "./helpers";

const now = new Date("2026-10-20T06:30:00Z");
const caption = "RCB vs MI kal khelenge, preview reel caption";

function item(title: string, over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: title, category: "search_interest", title, source: "Google", sourceKey: "google_trends_rss_in", sourceUrl: null, platform: "google_search",
    region: "IN", language: null, metric: null, observedAt: now.toISOString(), checkedAt: now.toISOString(), expiresAt: null, origin: "auto",
    related: relatedEntities(title), isDemo: false, ...over,
  };
}
const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  text: caption, intent: parseSportsIntent(caption), matchTeamIds: ["cricket:rcb", "cricket:mi"], resultVerified: false, postAt: now, region: "IN", ...over,
});

describe("relevance gates", () => {
  it("keeps the same event", () => {
    expect(gateEvidence(item("rcb vs mi"), ctx()).pass).toBe(true);
  });
  it("rejects an unrelated popular athlete and other teams", () => {
    expect(gateEvidence(item("Virat Kohli"), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/player/) });
    expect(gateEvidence(item("csk vs dc"), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/not about/) });
    expect(gateEvidence(item("rcb vs csk"), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/another team/) });
    expect(gateEvidence(item("#CSK", { category: "platform_observation", sourceKey: "reference:TikTok Creative Center", platform: "tiktok" }), ctx()).pass).toBe(false);
  });
  it("rejects keyword-overlap-only matches", () => {
    // Shares the word "preview" and "kal" but is about something else entirely.
    expect(gateEvidence(item("iPhone 18 preview"), ctx()).pass).toBe(false);
  });
  it("blocks sensitive claims unless verified", () => {
    expect(gateEvidence(item("rcb vs mi playing 11"), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/unverified/) });
    expect(gateEvidence(item("Bumrah injury rcb vs mi"), ctx({ intent: parseSportsIntent(`${caption} Bumrah`) })).pass).toBe(false);
    expect(gateEvidence(item("rcb vs mi rcb won"), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/result/) });
    expect(gateEvidence(item("rcb vs mi rcb won"), ctx({ resultVerified: true })).pass).toBe(true);
  });
  it("checks timeframe at the posting time, expiry and region", () => {
    const later = new Date(now.getTime() + 3 * 86_400_000);
    expect(gateEvidence(item("rcb vs mi"), ctx({ postAt: later }))).toMatchObject({ pass: false, reason: expect.stringMatching(/too old/) });
    expect(gateEvidence(item("rcb vs mi", { expiresAt: new Date(now.getTime() - 1000).toISOString() }), ctx()).pass).toBe(false);
    expect(gateEvidence(item("rcb vs mi", { region: "US" }), ctx())).toMatchObject({ pass: false, reason: expect.stringMatching(/region/) });
  });
  it("uses music/social items only when the creator names them", () => {
    const song = item("Ashke — Karan Aujla", { sourceKey: "apple_music_top_in", category: "platform_observation", platform: "apple_music" });
    const plain = parseSportsIntent("Mera dance video");
    expect(gateEvidence(song, ctx({ text: "Mera dance video", intent: plain, matchTeamIds: [] })).pass).toBe(false);
    expect(gateEvidence(song, ctx({ text: "Mera dance video on Ashke song", intent: plain, matchTeamIds: [] })).pass).toBe(true);
  });
});

describe("evidence bundle", () => {
  it("keeps categories separate, lists what was left out, and explains when nothing fits", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "ev@example.com");
    const obs = (title: string, sourceKey = "google_trends_rss_in") => ({
      sourceKey, dedupeKey: `${sourceKey}|${title}`, externalId: title, title, url: null, observedAt: new Date(Date.now() - 3_600_000), retrievedAt: new Date(),
      geo: "IN", language: null, platform: "google_search", rank: 1, metricName: "approx_traffic", metricValue: 20000, coverageNote: "x", hashtags: [], expiresAt: null, isDemo: false,
    });
    await db.insert(sourceObservations).values([obs("rcb vs mi"), obs("Virat Kohli"), obs("csk vs dc"), obs("rcb vs csk")]);
    await addReferences(db, user.id, [{ platform: "instagram", topic: "RCB MI reels", url: null, observedAt: new Date(), evidenceType: "creator_reference", sourceTool: "creator" }]);
    const intent = parseSportsIntent(caption);
    const res = await buildEvidence(db, user.id, { text: caption, intent, match: null, stage: null, publishAt: null, region: "IN", useTrends: true, includeDemo: false });
    expect(res.bundle.items.map((i) => [i.category, i.title])).toEqual([
      ["search_interest", "rcb vs mi"],
      ["creator_reference", "RCB MI reels"],
    ]);
    expect(res.bundle.items[0].metric?.scope).toMatch(/Google web searches in India/);
    // Looked related (names RCB) but names another team → listed as left out with the reason.
    expect(res.bundle.rejected).toEqual([expect.objectContaining({ title: "rcb vs csk", reason: expect.stringMatching(/another team/) })]);
    expect(res.bundle.items.map((i) => i.title)).not.toContain("Virat Kohli");
    expect(res.notes.join("\n")).toMatch(/SEARCH INTEREST/);
    expect(res.notes.join("\n")).toMatch(/REFERENCE \(creator-provided, not verified\)/);
    expect(res.bundle.noTrendReason).toBeNull();

    const none = await buildEvidence(db, user.id, { text: "ISL Kerala Blasters preview", intent: parseSportsIntent("ISL Kerala Blasters preview"), match: null, stage: null, publishAt: null, region: "IN", useTrends: true, includeDemo: false });
    expect(none.bundle.items).toEqual([]);
    expect(none.bundle.noTrendReason).toMatch(/No current/);
  });
});
