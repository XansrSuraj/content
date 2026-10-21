import { describe, expect, it } from "vitest";
import { CaptionResultSchema, type CaptionResult } from "@/lib/domain/captions";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { safeResult, validateResult, type ValidationContext } from "@/lib/domain/validate-output";
import { runCaptionTurn } from "@/lib/services/captions";
import type { CaptionProvider, CaptionRequest } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleModelOutput } from "./fixtures";

const caption = "RCB vs MI kal khelenge, mera preview video. Kohli ki form dekhni hai";

const SUFFIX = { original_improved: "", search_focused: " Dekhte hain.", conversation_focused: " Batao." } as const;

function resultWith(platform: string, opt: { caption?: string; title?: string; description?: string; hashtags?: string[]; same?: boolean }): CaptionResult {
  const base = sampleModelOutput();
  // Options differ by a neutral sentence unless `same` asks for identical ones.
  const o = (kind: keyof typeof SUFFIX) => {
    const end = opt.same ? "" : SUFFIX[kind];
    return {
      kind, title: opt.title ?? "", description: opt.description ? opt.description + (opt.caption ? "" : end) : "", caption: opt.caption ? opt.caption + end : "", hashtags: opt.hashtags ?? ["#RCBvsMI"], why: "w",
    };
  };
  return CaptionResultSchema.parse({
    ...base,
    platforms: [{ platform, recommended: "original_improved", options: [o("original_improved"), o("search_focused"), o("conversation_focused")] }],
  });
}

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  sourceText: caption, evidenceText: "", intent: parseSportsIntent(caption), matchTeamIds: ["cricket:rcb", "cricket:mi"],
  stage: "upcoming", resultVerified: false, language: "hinglish", ...over,
});
const codes = (r: CaptionResult, c = ctx()) => [...new Set(validateResult(r, c).map((i) => i.code))];

describe("validator", () => {
  it("passes a clean preview", () => {
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI kal! Kohli ki form par sabki nazar. Aapka prediction kya hai?" }))).toEqual([]);
  });

  it("catches invented results, scores, injuries, giveaways and shoutouts", () => {
    expect(codes(resultWith("instagram_reels", { caption: "RCB ne MI ko 5 wickets se hara diya!" }))).toContain("result_claim");
    expect(codes(resultWith("instagram_reels", { caption: "Final score 180/4, kya match tha." }))).toEqual(expect.arrayContaining(["result_claim", "unsupported_number"]));
    expect(codes(resultWith("instagram_reels", { caption: "Bumrah injury ke baad MI kamzor." }))).toEqual(expect.arrayContaining(["banned_claim", "extra_entity"]));
    expect(codes(resultWith("instagram_reels", { caption: "Comment karo, giveaway hai!" }))).toContain("banned_claim");
    expect(codes(resultWith("instagram_reels", { caption: "Follow karo shoutout milega." }))).toContain("banned_claim");
  });

  it("allows a result only when it is verified", () => {
    const r = resultWith("instagram_reels", { caption: "RCB jeet gaye! Kya raat thi." });
    expect(codes(r)).toContain("result_claim");
    expect(codes(r, ctx({ stage: "completed", resultVerified: true }))).not.toContain("result_claim");
  });

  it("flags live/today claims when the status is unknown", () => {
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI abhi live, dekho!" }), ctx({ stage: "unknown" }))).toContain("timing_claim");
  });

  it("flags names and numbers that are not in the caption or evidence", () => {
    expect(codes(resultWith("instagram_reels", { caption: "Dhoni bhi aa rahe hain RCB vs MI dekhne." }))).toContain("extra_entity");
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI: 3 baatein dekhni hain." }))).toEqual([]);
    expect(codes(resultWith("instagram_reels", { caption: "Kohli ke 82 runs yaad hain?" }))).toContain("unsupported_number");
  });

  it("keeps Hinglish in Roman script and Hindi in Devanagari", () => {
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI kal. भाई क्या मैच होगा!" }))).toContain("language_mix");
    const hindi = ctx({ language: "hindi", sourceText: "आरसीबी और एमआई का मैच कल" });
    expect(codes(resultWith("instagram_reels", { caption: "This is going to be a really big night for everyone here." }), hindi)).toContain("language_mix");
  });

  it("checks platform fields, limits and wording", () => {
    expect(codes(resultWith("youtube", { title: "RCB vs MI preview", description: "Save this Reel and share!" }))).toContain("platform_wording");
    expect(codes(resultWith("youtube", { title: "", description: "RCB vs MI preview" }))).toContain("missing_field");
    expect(codes(resultWith("youtube", { title: "RCB vs MI ".repeat(15), description: "Preview" }))).toContain("too_long");
    expect(codes(resultWith("instagram_reels", { caption: "Subscribe karo for more RCB vs MI" }))).toContain("platform_wording");
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI", hashtags: ["#RCB", "#rcb"] }))).toContain("hashtag_issue");
  });

  it("safe result removes only the bad sentences and says so", () => {
    const r = resultWith("instagram_reels", { caption: "RCB vs MI kal. RCB ne 5 wickets se jeet liya. Aapka prediction?" });
    const safe = safeResult(r, validateResult(r, ctx()), caption);
    expect(safe.platforms[0].options[0].caption).toBe("RCB vs MI kal. Aapka prediction?");
    expect(safe.limitations.join(" ")).toMatch(/could not be verified/);
    expect(codes(safe)).toEqual([]);
  });
});

describe("repair loop", () => {
  function scripted(outputs: CaptionResult[]) {
    const seen: CaptionRequest[] = [];
    const provider: CaptionProvider = {
      name: "scripted",
      async generate(req) {
        seen.push(req);
        return { data: outputs[Math.min(seen.length - 1, outputs.length - 1)], mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    return { seen, provider };
  }

  it("repairs once with targeted instructions and keeps the fixed answer", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "rep1@example.com");
    const bad = resultWith("instagram_reels", { caption: "RCB ne MI ko hara diya! Giveaway bhi hai." });
    const good = resultWith("instagram_reels", { caption: "RCB vs MI kal! Kohli ki form par nazar. Aapka prediction?" });
    const { seen, provider } = scripted([bad, good]);
    const res = await runCaptionTurn(db, user, { conversationId: null, message: caption, opportunityId: null }, provider);
    expect(seen).toHaveLength(2);
    expect(seen[1].repair?.join(" ")).toMatch(/result|giveaway/);
    expect(res.ok && CaptionResultSchema.parse(res.value.assistantMessage.result).platforms[0].options[0].caption).toMatch(/prediction/);
  });

  it("stops after 2 repairs and falls back to a safe result", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "rep2@example.com");
    const bad = resultWith("instagram_reels", { caption: "RCB vs MI kal. RCB ne MI ko hara diya!" });
    const { seen, provider } = scripted([bad]);
    const res = await runCaptionTurn(db, user, { conversationId: null, message: caption, opportunityId: null }, provider);
    expect(seen).toHaveLength(3);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = CaptionResultSchema.parse(res.value.assistantMessage.result);
    expect(r.platforms[0].options[0].caption).toBe("RCB vs MI kal.");
    expect(r.variants[0].caption).toBe("RCB vs MI kal.");
    expect(r.limitations.join(" ")).toMatch(/could not be verified/);
  });
});

describe("validator refinements from the sports eval", () => {
  it("a question is not a result claim", () => {
    expect(codes(resultWith("youtube", { title: "Arsenal vs Everton: who wins this one?", description: "My preview." }), ctx({ intent: parseSportsIntent("Arsenal vs Everton preview"), matchTeamIds: [] }))).toEqual([]);
  });
  it("the safe pass swaps another platform's words instead of leaving them", () => {
    const r = resultWith("youtube", { title: "RCB vs MI preview reel", description: "Save this Reel. RCB vs MI kal." });
    const safe = safeResult(r, validateResult(r, ctx()), caption);
    expect(safe.platforms[0].options[0].title).toBe("RCB vs MI preview video");
    expect(safe.platforms[0].options[0].description).not.toMatch(/reel/i);
    expect(codes(safe).filter((c) => c === "platform_wording")).toEqual([]);
  });
});

describe("posting after kick-off", () => {
  it("future-start wording is a timing claim when the post lands after kick-off", () => {
    const r = resultWith("instagram_reels", { caption: "RCB vs MI ka match 7:30 pm se start hoga. Aapka prediction?" });
    expect(codes(r, ctx({ stage: "unknown", postAfterStart: true, evidenceText: "7:30 pm" }))).toContain("timing_claim");
    expect(codes(r, ctx({ stage: "upcoming", postAfterStart: false, evidenceText: "7:30 pm" }))).not.toContain("timing_claim");
  });
});

describe("eval-found gaps", () => {
  it("a stated score inside a question is still a result claim", () => {
    expect(codes(resultWith("instagram_reels", { caption: "Real ne Barca ko 2-1 se haraya, kya match tha?" }), ctx({ intent: parseSportsIntent("Real vs Barca El Clasico reaction"), matchTeamIds: [] }))).toContain("result_claim");
  });
  it("identical options are flagged", () => {
    expect(codes(resultWith("instagram_reels", { caption: "RCB vs MI kal! Aapka prediction kya hai?", same: true }))).toContain("duplicate_option");
  });
});

describe("script slips", () => {
  it("flags a word in another script inside a Hindi caption", () => {
    const hindi = ctx({ language: "hindi", sourceText: "आरसीबी और एमआई का कल का मैच" });
    expect(codes(resultWith("instagram_reels", { caption: "क्या ये आरसीबी की सबसे बेहतरीन পারফরম্যান্স थी?" }), hindi)).toContain("language_mix");
    expect(codes(resultWith("instagram_reels", { caption: "क्या ये आरसीबी की सबसे बेहतरीन परफॉर्मेंस थी?" }), hindi)).not.toContain("language_mix");
  });
});
