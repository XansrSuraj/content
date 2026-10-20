/**
 * Rules for evidence confidence, freshness and momentum. These are computed
 * from stored observations only, so a label can never claim more than the data.
 */

export interface ObservationLike {
  sourceKey: string;
  externalId: string;
  geo: string;
  platform: string;
  observedAt: Date;
  retrievedAt: Date;
  rank: number | null;
  isDemo: boolean;
}

export type Confidence = "none" | "low" | "medium" | "high";

export function evidenceConfidence(obs: ObservationLike[]): Confidence {
  if (!obs.length) return "none";
  const sourcesCount = new Set(obs.map((o) => o.sourceKey)).size;
  const days = new Set(obs.map((o) => o.observedAt.toISOString().slice(0, 10))).size;
  if (sourcesCount >= 2 && days >= 2) return "high";
  if (sourcesCount >= 2 || days >= 2) return "medium";
  return "low";
}

export const CONFIDENCE_COPY: Record<Confidence, string> = {
  none: "No source evidence — idea only",
  low: "Low: one source, one observation",
  medium: "Medium: repeated observations or two sources",
  high: "High: two or more sources across multiple days",
};

export type Freshness =
  | { kind: "no_evidence" }
  | { kind: "fresh"; latest: Date; ageHours: number }
  | { kind: "stale"; latest: Date; ageHours: number };

export const STALE_AFTER_HOURS = 72;

export function freshness(obs: ObservationLike[], now: Date = new Date()): Freshness {
  if (!obs.length) return { kind: "no_evidence" };
  const latest = obs.reduce((a, b) => (a.observedAt > b.observedAt ? a : b)).observedAt;
  const ageHours = Math.max(0, (now.getTime() - latest.getTime()) / 3_600_000);
  return ageHours > STALE_AFTER_HOURS ? { kind: "stale", latest, ageHours } : { kind: "fresh", latest, ageHours };
}

export interface MomentumPoint {
  date: string;
  rank: number;
}

/**
 * Momentum is only reported from comparable observations: same source, same
 * item, same geography, ranked, one point per day. Fewer than two points → null.
 */
export function comparableMomentum(obs: ObservationLike[]): { sourceKey: string; geo: string; points: MomentumPoint[] } | null {
  const groups = new Map<string, ObservationLike[]>();
  for (const o of obs) {
    if (o.rank == null) continue;
    const k = `${o.sourceKey}|${o.externalId}|${o.geo}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  let best: { sourceKey: string; geo: string; points: MomentumPoint[] } | null = null;
  for (const list of groups.values()) {
    const byDay = new Map<string, number>();
    for (const o of list.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())) {
      byDay.set(o.observedAt.toISOString().slice(0, 10), o.rank!);
    }
    const points = [...byDay.entries()].map(([date, rank]) => ({ date, rank }));
    if (points.length >= 2 && (!best || points.length > best.points.length)) {
      best = { sourceKey: list[0].sourceKey, geo: list[0].geo, points };
    }
  }
  return best;
}

export interface RankableOpportunity {
  id: string;
  categories: string[];
  languages: string[];
  platforms: string[];
  regions: string[];
}

export interface PersonalSignals {
  categories: string[];
  languages: string[];
  platforms: string[];
  region: string;
  /** Categories of items this creator saved (own data only). */
  savedCategories: string[];
  rejectedIds: Set<string>;
  useFeedback: boolean;
}

export interface Ranked<T> {
  item: T;
  score: number;
  reasons: string[];
}

/** Transparent profile-based ranking. Every point of score has a stated reason. */
export function rankForCreator<T extends RankableOpportunity>(items: T[], s: PersonalSignals): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    if (s.useFeedback && s.rejectedIds.has(item.id)) continue;
    let score = 0;
    const reasons: string[] = [];
    const cat = item.categories.filter((c) => s.categories.includes(c));
    if (cat.length) {
      score += 3;
      reasons.push(`Matches your category: ${cat.join(", ")}`);
    }
    const lang = item.languages.filter((l) => s.languages.includes(l));
    if (lang.length) {
      score += 2;
      reasons.push(`Works in ${lang.join(", ")}`);
    }
    const plat = item.platforms.filter((p) => s.platforms.includes(p));
    if (plat.length) {
      score += 1;
      reasons.push("Suits a platform you post on");
    }
    if (item.regions.includes(s.region) || item.regions.includes("IN")) score += 0.5;
    if (s.useFeedback) {
      const savedCat = item.categories.filter((c) => s.savedCategories.includes(c));
      if (savedCat.length) {
        score += 1;
        reasons.push("Similar to ideas you saved");
      }
    }
    out.push({ item, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}
