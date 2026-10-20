import { describe, expect, it } from "vitest";
import { cleanHashtags, entityHashtags, finalTagsFor, hashtagCountFor, tagWords } from "@/lib/domain/hashtag-builder";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { runCaptionTurn } from "@/lib/services/captions";
import { CaptionResultSchema } from "@/lib/domain/captions";
import type { CaptionProvider } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleModelOutput } from "./fixtures";

const intent = parseSportsIntent("RCB vs MI preview, Kohli ka form dekhna");
const ctx = { intent, matchTeamIds: ["cricket:rcb", "cricket:mi"], platform: "instagram_reels" };

describe("hashtags", () => {
  it("splits tags into words to read entities", () => {
    expect(tagWords("#RCBvsMI")).toBe("RCB vs MI");
    expect(tagWords("#ViratKohli")).toBe("Virat Kohli");
  });

  it("builds candidates from confirmed content", () => {
    const tags = entityHashtags(intent, ctx.matchTeamIds).map((c) => c.tag);
    expect(tags).toEqual(expect.arrayContaining(["#RCBvsMI", "#RoyalChallengersBengaluru", "#MumbaiIndians", "#ViratKohli", "#MatchPreview", "#Cricket"]));
  });

  it("drops filler, case-variant duplicates and other teams' or players' tags", () => {
    const out = cleanHashtags(["#viral", "#FYP", "#Trending", "#explore", "#RCB", "#rcb", "#CSK", "#MSDhoni", "#IPL", "#ViratKohli"], ctx);
    expect(out).toEqual(["#RCB", "#IPL", "#ViratKohli"]);
  });

  it("caps per platform and keeps #Shorts only on YouTube", () => {
    expect(hashtagCountFor("instagram_reels")).toBe(5);
    expect(finalTagsFor(["#Shorts", "#RCBFans"], ctx)).not.toContain("#Shorts");
    expect(finalTagsFor(["#Shorts"], { ...ctx, platform: "youtube_shorts" })).toHaveLength(hashtagCountFor("youtube_shorts"));
    expect(finalTagsFor([], ctx).length).toBeLessThanOrEqual(5);
  });

  it("is applied to every answer: entity tags first, no filler, suggestions keep reasons", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "tags@example.com");
    const out = sampleModelOutput();
    out.platforms[0].options = out.platforms[0].options.map((o) => ({ ...o, hashtags: ["#viral", "#CSK", "#BudgetPhone"] }));
    out.hashtagSuggestions = [{ tag: "#fyp", reason: "x" }, { tag: "#IPL", reason: "League" }];
    const provider: CaptionProvider = {
      name: "rec",
      async generate() {
        return { data: CaptionResultSchema.parse(out), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "RCB vs MI preview reel", opportunityId: null }, provider);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = CaptionResultSchema.parse(res.value.assistantMessage.result);
    const tags = r.platforms[0].options[0].hashtags;
    expect(tags[0]).toBe("#RCBvsMI");
    expect(tags).not.toContain("#viral");
    expect(tags).not.toContain("#CSK");
    expect(r.variants[0].hashtags).toEqual(tags);
    expect(r.hashtagSuggestions.map((h) => h.tag)).not.toContain("#fyp");
    expect(r.hashtagSuggestions.find((h) => h.tag === "#IPL")?.reason).toBe("League");
  });
});
