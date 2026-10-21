/**
 * Configurable creator categories and caption options.
 * The product is sports-only for now: `available: false` niches are shown as "coming soon".
 */

export interface Category {
  id: string;
  label: string;
  hinglish: string;
  available: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "sports", label: "Sports", hinglish: "Sports (cricket & football)", available: true },
  { id: "tech", label: "Technology", hinglish: "Tech & gadgets", available: false },
  { id: "education", label: "Education", hinglish: "Padhai & explainers", available: false },
  { id: "comedy", label: "Comedy", hinglish: "Comedy & skits", available: false },
  { id: "food", label: "Food", hinglish: "Food & recipes", available: false },
  { id: "gaming", label: "Gaming", hinglish: "Gaming", available: false },
  { id: "art", label: "Art", hinglish: "Art & craft", available: false },
  { id: "beauty", label: "Beauty", hinglish: "Beauty & skincare", available: false },
  { id: "music", label: "Music", hinglish: "Music", available: false },
  { id: "lifestyle", label: "Lifestyle", hinglish: "Lifestyle & vlogs", available: false },
  { id: "family", label: "Family-friendly", hinglish: "Family-friendly", available: false },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
/** The niches creators can use today. */
export const AVAILABLE_CATEGORY_IDS = CATEGORIES.filter((c) => c.available).map((c) => c.id);

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
