/**
 * Configurable creator categories and caption options.
 * `focus: true` marks the niches that have hand-built demo content and tuned
 * prompts today. Others are selectable but described as early support.
 */

export interface Category {
  id: string;
  label: string;
  hinglish: string;
  focus: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "tech", label: "Technology", hinglish: "Tech & gadgets", focus: true },
  { id: "education", label: "Education", hinglish: "Padhai & explainers", focus: true },
  { id: "comedy", label: "Comedy", hinglish: "Comedy & skits", focus: true },
  { id: "food", label: "Food", hinglish: "Food & recipes", focus: true },
  { id: "gaming", label: "Gaming", hinglish: "Gaming", focus: false },
  { id: "sports", label: "Sports", hinglish: "Sports & cricket", focus: false },
  { id: "art", label: "Art", hinglish: "Art & craft", focus: false },
  { id: "beauty", label: "Beauty", hinglish: "Beauty & skincare", focus: false },
  { id: "music", label: "Music", hinglish: "Music", focus: false },
  { id: "lifestyle", label: "Lifestyle", hinglish: "Lifestyle & vlogs", focus: false },
  { id: "family", label: "Family-friendly", hinglish: "Family-friendly", focus: false },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const LANGUAGES = [
  { id: "hinglish", label: "Hinglish" },
  { id: "hindi", label: "Hindi (देवनागरी)" },
  { id: "english", label: "English" },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]["id"];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [LanguageId, ...LanguageId[]];

export const TONES = [
  { id: "conversational", label: "Conversational" },
  { id: "funny", label: "Funny" },
  { id: "educational", label: "Educational" },
  { id: "emotional", label: "Emotional" },
  { id: "professional", label: "Professional" },
  { id: "energetic", label: "Energetic" },
] as const;
export type ToneId = (typeof TONES)[number]["id"];
export const TONE_IDS = TONES.map((t) => t.id) as [ToneId, ...ToneId[]];

export const GOALS = [
  { id: "engagement", label: "Engagement" },
  { id: "followers", label: "Followers" },
  { id: "community", label: "Community" },
  { id: "leads", label: "Leads" },
  { id: "sales", label: "Sales" },
] as const;
export type GoalId = (typeof GOALS)[number]["id"];
export const GOAL_IDS = GOALS.map((g) => g.id) as [GoalId, ...GoalId[]];

export const LENGTHS = [
  { id: "short", label: "Short (1–2 lines)" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long / storytelling" },
] as const;
export type LengthId = (typeof LENGTHS)[number]["id"];
export const LENGTH_IDS = LENGTHS.map((l) => l.id) as [LengthId, ...LengthId[]];

export const REGIONS = [
  { id: "IN", label: "India (all)" },
  { id: "IN-north", label: "North India" },
  { id: "IN-south", label: "South India" },
  { id: "IN-west", label: "West India" },
  { id: "IN-east", label: "East India" },
  { id: "global", label: "Global / diaspora" },
] as const;
export const REGION_IDS = REGIONS.map((r) => r.id) as [string, ...string[]];

export function labelFor<T extends { id: string; label: string }>(list: readonly T[], id: string): string {
  return list.find((x) => x.id === id)?.label ?? id;
}
