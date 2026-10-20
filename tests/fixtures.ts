import type { CaptionResult } from "@/lib/domain/captions";

export function sampleResult(overrides: Partial<CaptionResult> = {}): CaptionResult {
  return {
    topicSummary: "Budget phone cinematic video",
    assumptions: [],
    clarifyingQuestion: null,
    platformVersions: [],
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
