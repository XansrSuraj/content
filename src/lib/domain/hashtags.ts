/**
 * Hashtag truthfulness rules.
 *
 * Three separate categories, never mixed:
 *  - "suggested":  topic-relevant suggestion (from AI or template). No trend claim.
 *  - "verified":   the tag appears in a stored, fresh, non-demo source observation
 *                  for the same platform family. Status comes from evidence only.
 *  - "demo":       appears only in clearly labeled demo observations.
 */

export const NOT_VERIFIED_NOTICE = "Relevant hashtag suggestions. Current trend status not verified.";

export function normalizeHashtag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#+/, "")
    .normalize("NFC")
    // keep letters (any script), marks (Devanagari matras), digits, underscore
    .replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
  return cleaned ? `#${cleaned}` : "";
}

export function dedupeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeHashtag(t);
    if (!n) continue;
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

export interface HashtagEvidence {
  sourceKey: string;
  sourceName: string;
  platform: string;
  geo: string;
  observedAt: Date;
  retrievedAt: Date;
  coverageNote: string;
  url: string | null;
  isDemo: boolean;
}

export type HashtagStatus =
  | { tag: string; status: "suggested" }
  | { tag: string; status: "verified"; evidence: HashtagEvidence[] }
  | { tag: string; status: "demo"; evidence: HashtagEvidence[] };

/** Max age of an observation that can still back a "verified" label. */
export const VERIFIED_MAX_AGE_HOURS = 72;

export function platformFamily(platform: string): string {
  if (platform.startsWith("youtube")) return "youtube";
  if (platform.startsWith("instagram")) return "instagram";
  if (platform.startsWith("facebook")) return "facebook";
  return platform;
}

/**
 * Classifies tags using only evidence passed in. A tag is "verified" only when
 * at least one non-demo observation exists that (a) contains the tag, (b) is for
 * the same platform family, (c) has source, geography, and timestamps, and
 * (d) is recent. Search-interest sources (e.g. Wikipedia) never verify hashtags
 * for social platforms because their platform is different.
 */
export function classifyHashtags(
  tags: string[],
  evidenceByTag: Map<string, HashtagEvidence[]>,
  targetPlatform: string,
  now: Date = new Date(),
): HashtagStatus[] {
  const family = platformFamily(targetPlatform);
  return dedupeHashtags(tags).map((tag) => {
    const all = evidenceByTag.get(tag.toLowerCase()) ?? [];
    const usable = all.filter(
      (e) =>
        platformFamily(e.platform) === family &&
        Boolean(e.sourceKey && e.geo && e.observedAt && e.retrievedAt) &&
        now.getTime() - e.observedAt.getTime() <= VERIFIED_MAX_AGE_HOURS * 3_600_000 &&
        e.observedAt.getTime() <= now.getTime() + 60_000,
    );
    const real = usable.filter((e) => !e.isDemo);
    if (real.length) return { tag, status: "verified", evidence: real };
    const demo = usable.filter((e) => e.isDemo);
    if (demo.length) return { tag, status: "demo", evidence: demo };
    return { tag, status: "suggested" };
  });
}

/** Picks the set for one-click copy, respecting the platform's configured limit. */
export function hashtagsForCopy(tags: string[], copyDefault: number, hardLimit: number | null): string[] {
  const unique = dedupeHashtags(tags);
  const n = Math.min(copyDefault, hardLimit ?? Number.POSITIVE_INFINITY);
  return unique.slice(0, n);
}
