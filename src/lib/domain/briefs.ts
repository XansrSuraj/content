import { z } from "zod";
import { PLATFORM_IDS } from "./platforms";
import { LANGUAGE_IDS, TONE_IDS } from "./options";
import { normalizeHashtag } from "./hashtags";

export const BriefRequestSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  opportunityId: z.string().max(64).nullable().default(null),
  platform: z.enum(PLATFORM_IDS).default("instagram_reels"),
  language: z.enum(LANGUAGE_IDS).default("hinglish"),
  tone: z.enum(TONE_IDS).default("conversational"),
  angle: z.string().trim().max(300).default(""),
  availableMinutes: z.number().int().min(10).max(2400).nullable().default(null),
  personalExample: z.string().trim().max(600).default(""),
});
export type BriefRequest = z.infer<typeof BriefRequestSchema>;

/** Model-facing schema: no numeric constraints, mapped to structured output. */
export const BriefModelOutputSchema = z.object({
  originalAngle: z.string(),
  intendedAudience: z.string(),
  hooks: z.array(z.string()),
  openingShot: z.string(),
  beats: z.array(z.object({ beat: z.string(), detail: z.string() })),
  callToAction: z.string(),
  titleOptions: z.array(z.string()),
  hashtags: z.array(z.string()).describe("Topic-relevant suggestions only; never claim trend status."),
  factsToVerify: z.array(z.string()).describe("Any factual claim the creator must check before posting."),
  lowEffortVersion: z.string().describe("A practical version that can be made with a phone in under an hour."),
  platformNotes: z.array(z.string()).describe("Packaging advice specific to the chosen platform. No universal posting-time claims."),
  assumptions: z.array(z.string()),
});

const tag = z
  .string()
  .transform((t) => normalizeHashtag(t))
  .pipe(z.string().min(2).max(60));

export const BriefContentSchema = z.object({
  originalAngle: z.string().min(1).max(600),
  intendedAudience: z.string().max(400),
  hooks: z.array(z.string().max(250)).min(1).max(6),
  openingShot: z.string().max(500),
  beats: z.array(z.object({ beat: z.string().max(120), detail: z.string().max(500) })).min(1).max(10),
  callToAction: z.string().max(300),
  titleOptions: z.array(z.string().max(200)).max(6),
  hashtags: z.array(tag).max(10),
  factsToVerify: z.array(z.string().max(300)).max(10),
  lowEffortVersion: z.string().max(800),
  platformNotes: z.array(z.string().max(300)).max(6),
  assumptions: z.array(z.string().max(300)).max(6),
  sourceRefs: z
    .array(z.object({ title: z.string(), url: z.string().nullable(), sourceName: z.string(), observedAt: z.string() }))
    .max(10)
    .default([]),
});
export type BriefContent = z.infer<typeof BriefContentSchema>;
