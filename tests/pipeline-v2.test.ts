import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptionContextSchema, CaptionResultSchema, enforceConstraints } from "@/lib/domain/captions";
import { TemplateCaptionProvider } from "@/lib/providers/ai/template";
import { buildCaptionUserPrompt } from "@/lib/providers/ai/prompts";
import { runCaptionTurn } from "@/lib/services/captions";
import { upsertMatches } from "@/lib/repo/sports";
import { getConversation } from "@/lib/repo/studio";
import type { CaptionProvider, CaptionRequest } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleModelOutput, sampleResult } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("result v2", () => {
  it("derives the older fields from platforms, so history and saving keep working", () => {
    const r = CaptionResultSchema.parse(sampleModelOutput());
    expect(r.platforms[0].platform).toBe("instagram_reels");
    expect(r.variants.map((v) => [v.id, v.approach])).toEqual([
      ["A", "Original improved"],
      ["B", "Search focused"],
      ["C", "Conversation focused"],
    ]);
    expect(r.recommendedVariantId).toBe("A");
    expect(r.recommendationReason).toMatch(/original_improved/);
    // Results stored before v2 still parse unchanged.
    expect(CaptionResultSchema.parse(sampleResult()).platforms).toEqual([]);
  });

  it("keeps only requested platforms (primary first) and applies each platform's rules", () => {
    const out = sampleModelOutput();
    const yt = { platform: "youtube", recommended: "search_focused" as const, options: out.platforms[0].options.map((o) => ({ ...o, title: "Title 😎", description: "Desc 😎 #tag", caption: "" })) };
    const stray = { ...out.platforms[0], platform: "tiktok" };
    const r = CaptionResultSchema.parse({ ...out, platforms: [yt, out.platforms[0], stray] });
    const ctx = CaptionContextSchema.parse({ platform: "instagram_reels", extraPlatforms: ["youtube"], emoji: "none" });
    const fixed = enforceConstraints(r, ctx);
    expect(fixed.platforms.map((p) => p.platform)).toEqual(["instagram_reels", "youtube"]);
    const ytOut = fixed.platforms[1].options[0];
    expect(ytOut.title).toBe("Title");
    expect(ytOut.description).not.toMatch(/😎|#tag/);
  });
});

describe("platform switch", () => {
  const base = { originalInput: "Aaj RCB vs MI ka match hai, mera preview video", message: "Aaj RCB vs MI ka match hai, mera preview video", history: [], creator: null, evidenceNotes: [] };
  it("YouTube gets title + description; Instagram gets a caption", async () => {
    const t = new TemplateCaptionProvider();
    const yt = (await t.generate({ ...base, context: CaptionContextSchema.parse({ platform: "youtube_shorts" }) })).data;
    const ig = (await t.generate({ ...base, context: CaptionContextSchema.parse({ platform: "instagram_reels" }) })).data;
    const ytRec = yt.platforms[0].options[0];
    expect(ytRec.title.length).toBeGreaterThan(0);
    expect(ytRec.title.length).toBeLessThanOrEqual(100);
    expect(ytRec.description.length).toBeGreaterThan(0);
    expect(ytRec.caption).toBe("");
    expect(ig.platforms[0].options[0].caption.length).toBeGreaterThan(0);
    expect(ig.platforms[0].options[0].title).toBe("");
  });

  it("the prompt carries each platform's fields, limits and forbidden wording", () => {
    const prompt = buildCaptionUserPrompt({ ...base, context: CaptionContextSchema.parse({ platform: "youtube", extraPlatforms: ["instagram_reels"] }) } as CaptionRequest);
    expect(prompt).toMatch(/"fields": \[\s+"title",\s+"description"\s+\]/);
    expect(prompt).toMatch(/"neverSay": \[\s+"reel"/);
    expect(prompt).toMatch(/"id": "instagram_reels"/);
  });
});

describe("pipeline", () => {
  it("never calls a fixtures provider during a caption, and pins the resolved match", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "pipe@example.com");
    await upsertMatches(db, [
      {
        provider: "openligadb", externalId: "1", sport: "football", competition: "Premier League", competitionId: "football:pl", gender: "men",
        homeTeamId: "football:arsenal", awayTeamId: "football:everton", homeName: "FC Arsenal", awayName: "Everton FC",
        startsAt: new Date(Date.now() + 2 * 86_400_000), status: "scheduled", statusSource: "schedule_only", statusCheckedAt: new Date(), resultSummary: null, url: null,
      },
    ]);
    const fetchSpy = vi.fn(async () => {
      throw new Error("no network during captions");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const seen: CaptionRequest[] = [];
    const provider: CaptionProvider = {
      name: "rec",
      async generate(req) {
        seen.push(req);
        return { data: CaptionResultSchema.parse(sampleModelOutput()), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "Arsenal vs Everton preview, kaun jeetega?", opportunityId: null }, provider);
    expect(res.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    if (!res.ok) return;
    const conv = await getConversation(db, user.id, res.value.conversationId);
    expect((conv!.context as { matchId: string | null }).matchId).toBe(res.value.assistantMessage.sports?.match?.id);
    // A follow-up keeps the same match even without team names.
    await runCaptionTurn(db, user, { conversationId: res.value.conversationId, message: "Make it shorter.", opportunityId: null }, provider);
    expect(seen[1].evidenceNotes.join("\n")).toMatch(/MATCH .*FC Arsenal vs Everton FC/);
  });
});
