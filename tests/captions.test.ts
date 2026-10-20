import { describe, expect, it } from "vitest";
import {
  applyFollowUpToContext,
  CaptionContextSchema,
  CaptionResultSchema,
  DEFAULT_CONTEXT,
  enforceConstraints,
} from "@/lib/domain/captions";
import { BriefContentSchema } from "@/lib/domain/briefs";
import { TemplateCaptionProvider, stripInstructions } from "@/lib/providers/ai/template";
import { sampleResult } from "./fixtures";

describe("caption result validation", () => {
  it("accepts a well-formed result and normalizes hashtags", () => {
    const parsed = CaptionResultSchema.parse(sampleResult());
    expect(parsed.hashtagSuggestions[0].tag).toBe("#MobileFilmmaking");
  });

  it("rejects results without exactly three variants", () => {
    const r = sampleResult();
    expect(CaptionResultSchema.safeParse({ ...r, variants: r.variants.slice(0, 2) }).success).toBe(false);
  });

  it("rejects oversized fields and too many hashtags", () => {
    const r = sampleResult();
    const huge = { ...r, topicSummary: "x".repeat(5000) };
    expect(CaptionResultSchema.safeParse(huge).success).toBe(false);
    const stuffed = { ...r, variants: r.variants.map((v) => ({ ...v, hashtags: Array.from({ length: 30 }, (_, i) => `#t${i}`) })) };
    expect(CaptionResultSchema.safeParse(stuffed).success).toBe(false);
  });

  it("rejects malformed context input", () => {
    expect(CaptionContextSchema.safeParse({ platform: "myspace" }).success).toBe(false);
    expect(CaptionContextSchema.safeParse({ preserveTerms: Array(20).fill("x") }).success).toBe(false);
  });

  it("validates brief content", () => {
    expect(BriefContentSchema.safeParse({ originalAngle: "" }).success).toBe(false);
  });
});

describe("follow-up constraints", () => {
  const original = "Aaj maine apne budget phone se cinematic video shoot kiya.\nDusri line.";

  it("picks up common Hinglish follow-ups and keeps them sticky", () => {
    let ctx = DEFAULT_CONTEXT;
    ctx = applyFollowUpToContext("Aur short karo.", ctx, original).context;
    expect(ctx.length).toBe("short");
    ctx = applyFollowUpToContext("Emoji hata do", ctx, original).context;
    expect(ctx.emoji).toBe("none");
    ctx = applyFollowUpToContext("YouTube Shorts ke liye adapt karo", ctx, original).context;
    expect(ctx.platform).toBe("youtube_shorts");
    ctx = applyFollowUpToContext("Meri first line same rakho", ctx, original).context;
    expect(ctx.keepFirstLine).toBe("Aaj maine apne budget phone se cinematic video shoot kiya.");
    ctx = applyFollowUpToContext("Promotional kam rakho", ctx, original).context;
    expect(ctx.notes).toContain("Keep it less promotional");
    ctx = applyFollowUpToContext("Isko funny Hinglish mein likho", ctx, original).context;
    expect(ctx.tone).toBe("funny");
    expect(ctx.language).toBe("hinglish");
    ctx = applyFollowUpToContext("Sirf final caption aur hashtags do", ctx, original).context;
    expect(ctx.outputMode).toBe("final_only");
    // Earlier constraints are still in place after later turns.
    expect(ctx.emoji).toBe("none");
    expect(ctx.length).toBe("short");
    expect(ctx.platform).toBe("youtube_shorts");
  });

  it("enforces emoji removal, locked first line and flags missing preserved terms", () => {
    const ctx = { ...DEFAULT_CONTEXT, emoji: "none" as const, keepFirstLine: "Meri pehli line.", preserveTerms: ["Redmi"] };
    const out = enforceConstraints(sampleResult(), ctx);
    for (const v of out.variants) {
      expect(v.caption).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v.caption.split("\n")[0]).toBe("Meri pehli line.");
    }
    expect(out.hooks[0]).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(out.limitations.join(" ")).toContain("Redmi");
  });
});

describe("template preview (no AI key)", () => {
  it("drops request sentences so they never become caption text", () => {
    expect(stripInstructions("Aaj maine apne budget phone se video shoot kiya.\nInstagram ke liye better Hinglish caption aur hashtags do.")).toBe(
      "Aaj maine apne budget phone se video shoot kiya.",
    );
  });

  it("is labeled as template output and never claims AI processing", async () => {
    const p = new TemplateCaptionProvider();
    const out = await p.generate({
      context: DEFAULT_CONTEXT,
      originalInput: "Aaj maine budget phone se cinematic video shoot kiya.",
      message: "Aaj maine budget phone se cinematic video shoot kiya.",
      history: [],
      creator: null,
      evidenceNotes: [],
    });
    expect(out.mode).toBe("template_preview");
    expect(out.usage.model).toBeNull();
    expect(out.data.topicSummary).toMatch(/Template preview \(AI not used\)/);
    expect(out.data.limitations.join(" ")).toMatch(/ANTHROPIC_API_KEY/);
    expect(CaptionResultSchema.safeParse(out.data).success).toBe(true);
    expect(JSON.stringify(out.data).toLowerCase()).not.toContain("trending");
  });
});
