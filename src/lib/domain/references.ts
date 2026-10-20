import { z } from "zod";

/**
 * A reference topic must describe what was seen in words. A pasted URL alone is
 * never verification, so it is rejected: at least 3 letters must remain after
 * removing links.
 */
export function describesInWords(text: string): boolean {
  const withoutLinks = text.replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  return (withoutLinks.match(/[\p{L}]/gu) ?? []).length >= 3;
}

export const ReferenceTopic = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine(describesInWords, "Describe what you saw in a few words — a link alone is not enough.");

export const ReferenceUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "http(s) only");

/** Creator reference: always stored as "creator-provided", never live or verified. */
export const CreatorReferenceInput = z.object({
  platform: z.enum(["instagram", "youtube", "tiktok", "facebook", "reddit", "x", "other"]),
  topic: ReferenceTopic,
  url: ReferenceUrl.nullable().default(null),
  note: z.string().trim().max(300).default(""),
});
