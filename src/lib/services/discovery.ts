import "server-only";
import { config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  comparableMomentum,
  evidenceConfidence,
  freshness,
  rankForCreator,
  type Confidence,
  type RankReason,
  type Freshness,
} from "@/lib/domain/opportunities";
import { getProfile, listFeedback, personalizationAllowed } from "@/lib/repo/creator";
import {
  evidenceFor,
  getOpportunity,
  listOpportunities,
  relatedObservations,
  type Dataset,
  type Observation,
  type Opportunity,
  type OpportunityFilters,
} from "@/lib/repo/discovery";
import { listSaved, savedRefIds } from "@/lib/repo/work";

export function resolveDataset(user: SessionUser, requested: string | undefined): Dataset {
  const demoOk = config().demoEnabled;
  if (requested === "observed") return "observed";
  if (requested === "demo" && demoOk) return "demo";
  return user.isDemo && demoOk ? "demo" : "observed";
}

export interface FeedItem {
  opportunity: Opportunity;
  evidence: Observation[];
  confidence: Confidence;
  freshness: Freshness;
  reasons: RankReason[];
  saved: boolean;
}

export async function getFeed(db: DB, user: SessionUser, filters: Omit<OpportunityFilters, "dataset"> & { dataset?: string; fresh?: string }) {
  const dataset = resolveDataset(user, filters.dataset);
  const [profile, useFeedback] = await Promise.all([getProfile(db, user.id), personalizationAllowed(db, user.id)]);
  const items = await listOpportunities(db, { ...filters, dataset });
  const evidence = await evidenceFor(db, items.map((i) => i.id));

  const rejected = useFeedback ? await listFeedback(db, user.id, "opportunity") : [];
  const savedOpps = useFeedback ? await listSaved(db, user.id, "opportunity") : [];
  const savedIds = new Set(savedOpps.map((s) => s.refId));
  const savedCategories = items.filter((i) => savedIds.has(i.id)).flatMap((i) => i.categories);

  const ranked = rankForCreator(items, {
    categories: profile?.categories ?? [],
    languages: profile?.contentLanguages ?? [],
    platforms: profile?.platforms ?? [],
    region: profile?.region ?? "IN",
    savedCategories,
    rejectedIds: new Set(rejected.filter((r) => r.verdict === "rejected").map((r) => r.targetId)),
    useFeedback,
  });
  const saved = await savedRefIds(db, user.id, "opportunity", items.map((i) => i.id));

  let feed: FeedItem[] = ranked.map(({ item, reasons }) => {
    const ev = evidence.get(item.id) ?? [];
    return {
      opportunity: item,
      evidence: ev,
      confidence: evidenceConfidence(ev),
      freshness: freshness(ev),
      reasons,
      saved: saved.has(item.id),
    };
  });

  // Freshness filters only apply where evidence timestamps exist.
  if (filters.fresh === "24h" || filters.fresh === "72h") {
    const hours = filters.fresh === "24h" ? 24 : 72;
    feed = feed.filter((f) => f.freshness.kind !== "no_evidence" && f.freshness.ageHours <= hours);
  }

  return {
    dataset,
    feed,
    hiddenByFeedback: useFeedback ? rejected.filter((r) => r.verdict === "rejected").length : 0,
    profileComplete: Boolean(profile?.onboardedAt),
  };
}

export async function getOpportunityDetail(db: DB, user: SessionUser, id: string) {
  // Demo users may open real items too; real users never see demo items.
  const opp = await getOpportunity(db, id, user.isDemo && config().demoEnabled ? "any" : "observed");
  if (!opp) return null;
  const evidence = (await evidenceFor(db, [opp.id])).get(opp.id) ?? [];
  const related = await relatedObservations(db, evidence);
  const saved = (await savedRefIds(db, user.id, "opportunity", [opp.id])).has(opp.id);
  return {
    opportunity: opp,
    evidence,
    confidence: evidenceConfidence(evidence),
    freshness: freshness(evidence),
    momentum: comparableMomentum(related.length ? related : evidence),
    saved,
  };
}
