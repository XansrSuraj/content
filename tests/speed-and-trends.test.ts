import { describe, expect, it, vi } from "vitest";
import { matchTrends, metricText, trendContextNotes, type CandidateObservation } from "@/lib/services/trend-context";
import { needsReview } from "@/lib/providers/trends/filters";
import { DEFAULT_CONTEXT, enforceConstraints, removeEngagementBait } from "@/lib/domain/captions";
import { OllamaCaptionProvider, expandLocalCaption, previewFromPartial } from "@/lib/providers/ai/ollama";
import { CaptionResultSchema } from "@/lib/domain/captions";
import { sampleResult } from "./fixtures";

const obs = (title: string, extra: Partial<CandidateObservation> = {}): CandidateObservation => ({
  title,
  sourceKey: "google_trends_rss_in",
  platform: "google_search",
  geo: "IN",
  observedAt: new Date("2026-10-20T12:00:00Z"),
  metricName: "approx_traffic",
  metricValue: 2000,
  url: null,
  isDemo: false,
  ...extra,
});

describe("trend context matching", () => {
  it("matches only genuinely related trends", () => {
    const items = matchTrends("Kal ke Ranji Trophy match ka last over reaction video", [obs("ranji trophy"), obs("deepika padukone"), obs("bigg boss")]);
    expect(items.map((i) => i.title)).toEqual(["ranji trophy"]);
    expect(items[0].metric).toBe("Google approx. searches 2,000+");
    expect(items[0].matched).toContain("ranji trophy");
  });

  it("returns nothing when no trend relates (no forced trend-jacking)", () => {
    expect(matchTrends("Ghar par cafe-style chai banayi", [obs("ranji trophy"), obs("stock market")])).toEqual([]);
  });

  it("ignores short or generic words", () => {
    expect(matchTrends("Aaj ka vlog", [obs("aaj tak live")])).toEqual([]);
  });

  it("matches Devanagari titles", () => {
    expect(matchTrends("बंबई स्टॉक एक्सचेंज पर मेरा वीडियो", [obs("बंबई स्टॉक एक्सचेंज")])).toHaveLength(1);
  });

  it("describes context to the model as search interest, never as virality", () => {
    const [note] = trendContextNotes(matchTrends("ranji trophy reaction", [obs("ranji trophy")]));
    expect(note).toMatch(/not social-media virality/);
    expect(note).toMatch(/never call it viral or trending on social media/);
  });

  it("only labels source-defined metrics", () => {
    expect(metricText("approx_traffic", 200)).toBe("Google approx. searches 200+");
    expect(metricText("views_ceil", 1500)).toMatch(/rounded up/);
    expect(metricText("chart_position", 3)).toBeNull();
  });

  it("holds back violent/tragic news for human review", () => {
    expect(needsReview("ബോംബ്")).toBe(true);
    expect(needsReview("Mumbai blast")).toBe(true);
    expect(needsReview("हादसा")).toBe(true);
    expect(needsReview("ranji trophy")).toBe(false);
  });
});

describe("engagement bait filter", () => {
  it("removes bait sentences but keeps the rest and its line breaks", () => {
    const out = removeEngagementBait("Camera achha hai.\nKya aapke phone mein bhi aisi problem hai? Comment karo warna...");
    expect(out.removed).toBe(true);
    expect(out.text).toBe("Camera achha hai.\nKya aapke phone mein bhi aisi problem hai?");
    expect(removeEngagementBait("99% log ye nahi jaante! Phone tips.").text).toBe("Phone tips.");
    expect(removeEngagementBait("Comment karo aapka favourite shot kaunsa tha.").removed).toBe(false);
  });

  it("reports removals as a limitation", () => {
    const r = sampleResult();
    r.variants[1] = { ...r.variants[1], caption: "Naya phone liya. Share karo warna bad luck!" };
    const out = enforceConstraints(r, DEFAULT_CONTEXT);
    expect(out.variants[1].caption).toBe("Naya phone liya.");
    expect(out.limitations.join(" ")).toMatch(/Removed engagement bait from option B/);
  });
});

describe("fast local generation", () => {
  it("expands the compact local format into a valid full result", () => {
    const s = sampleResult();
    const full = CaptionResultSchema.parse(
      expandLocalCaption({ topicSummary: s.topicSummary, variants: s.variants, recommendedVariantId: "A", recommendationReason: "x", hooks: s.hooks }),
    );
    expect(full.hashtagSuggestions.length).toBeGreaterThan(0);
    expect(full.limitations.join(" ")).toMatch(/small local model/);
  });

  it("streams NDJSON, reports progress, and sends a compact prompt", async () => {
    const s = sampleResult();
    const content = JSON.stringify({ topicSummary: s.topicSummary, variants: s.variants, recommendedVariantId: "A", recommendationReason: "fits", hooks: s.hooks });
    const half = Math.floor(content.length / 2);
    const body = [
      JSON.stringify({ message: { content: content.slice(0, half) }, done: false }),
      JSON.stringify({ message: { content: content.slice(half) }, done: false }),
      JSON.stringify({ model: "llama3.2:3b", message: { content: "" }, done: true, done_reason: "stop", prompt_eval_count: 900, eval_count: 300 }),
    ].join("\n");
    const fetchMock = vi.fn<(u: string, i: RequestInit) => Promise<Response>>(async () => new Response(body, { headers: { "content-type": "application/x-ndjson" } }));
    const progress: number[] = [];
    const p = new OllamaCaptionProvider({ baseUrl: "http://localhost:11434", model: "llama3.2:3b", timeoutMs: 5000, numCtx: 4096, maxOutputTokens: 1200 }, fetchMock);
    const out = await p.generate({
      context: DEFAULT_CONTEXT,
      originalInput: "x",
      message: "x",
      history: [],
      creator: null,
      evidenceNotes: [],
      onProgress: ({ tokens }) => progress.push(tokens),
    });
    expect(out.data.variants).toHaveLength(3);
    expect(out.usage).toMatchObject({ inputTokens: 900, outputTokens: 300 });
    expect(progress.length).toBeGreaterThanOrEqual(2);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.stream).toBe(true);
    expect(sent.keep_alive).toBe("30m");
    // Compact prompt: the schema is enforced by `format`, not pasted into the prompt.
    expect(sent.messages[1].content).not.toContain('"$defs"');
    expect(sent.messages[1].content).not.toContain('"properties"');
    expect(Object.keys(sent.format.properties)).toEqual(["topicSummary", "variants", "recommendedVariantId", "recommendationReason", "hooks"]);
  });

  it("previews option A from a partially streamed reply", () => {
    expect(previewFromPartial('{"topicSummary":"x","variants":[{"id":"A","approach":"Hook","caption":"Ye shot budget phone se\\nhai')).toBe(
      "Ye shot budget phone se\nhai",
    );
    expect(previewFromPartial('{"topicSummary":"x"')).toBe("");
  });
});
