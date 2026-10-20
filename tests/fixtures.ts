import type { CaptionResult } from "@/lib/domain/captions";

export function sampleResult(overrides: Partial<CaptionResult> = {}): CaptionResult {
  return {
    topicSummary: "Budget phone cinematic video",
    assumptions: [],
    clarifyingQuestion: null,
    platformVersions: [],
    platforms: [],
    variants: [
      { id: "A", approach: "Hook", caption: "Ye shot budget phone se hai 😎\nTry karo.", hashtags: ["#MobileFilmmaking"] },
      { id: "B", approach: "Story", caption: "Socha naya phone lena padega 📱\nPhir try kiya.", hashtags: ["#BudgetPhone"] },
      { id: "C", approach: "Tips", caption: "Light, steady hands, slow pan ✨", hashtags: ["#FilmmakingTips"] },
    ],
    recommendedVariantId: "A",
    recommendationReason: "Contrast first",
    hooks: ["Ye shot budget phone se hai 🔥"],
    hashtagSuggestions: [{ tag: "MobileFilmmaking", reason: "topic" }],
    keywords: [],
    improvements: [],
    limitations: [],
    ...overrides,
  };
}

/** A model reply in the v2 output format (platforms × three typed options). */
export function sampleModelOutput() {
  const opt = (kind: "original_improved" | "search_focused" | "conversation_focused", caption: string) => ({
    kind, title: "", description: "", caption, hashtags: ["#MobileFilmmaking", "#BudgetPhone"], why: `Fits because ${kind}.`,
  });
  return {
    topicSummary: "Budget phone cinematic video",
    assumptions: [],
    clarifyingQuestion: null,
    platforms: [
      {
        platform: "instagram_reels",
        recommended: "original_improved" as const,
        options: [opt("original_improved", "Ye shot budget phone se hai."), opt("search_focused", "Budget phone cinematic video tips."), opt("conversation_focused", "Aapka phone kaunsa hai?")],
      },
    ],
    hooks: ["Ye shot budget phone se hai"],
    hashtagSuggestions: [{ tag: "#MobileFilmmaking", reason: "Topic" }],
    keywords: [],
    improvements: [],
    limitations: [],
  };
}
