import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { platformReferences, sportsMatches } from "@/lib/db/schema";
import type { MatchRecord, MatchStatus, StatusSource } from "@/lib/domain/sports/resolve";
import { sameFixtureNames, type Sport } from "@/lib/domain/sports/entities";

type MatchRow = typeof sportsMatches.$inferSelect;

export function toMatchRecord(r: MatchRow): MatchRecord {
  return {
    id: r.id,
    provider: r.provider,
    sport: r.sport,
    competition: r.competition,
    gender: r.gender,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeName: r.homeName,
    awayName: r.awayName,
    startsAt: r.startsAt,
    status: r.status,
    statusSource: r.statusSource,
    statusCheckedAt: r.statusCheckedAt,
    resultSummary: r.resultSummary,
    url: r.url,
    competitionId: r.competitionId,
  };
}

export interface MatchUpsert {
  provider: string;
  externalId: string;
  sport: Sport;
  competition: string;
  gender: "men" | "women";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  startsAt: Date;
  status: MatchStatus;
  statusSource: StatusSource;
  statusCheckedAt: Date;
  resultSummary: string | null;
  url: string | null;
  competitionId?: string | null;
  season?: string | null;
  venue?: string | null;
  /** True when this provider reports live status (football-data.org, CricAPI), false for schedule-only feeds. */
  verified?: boolean;
}

const AUTHORITY: Record<string, number> = { creator: 0, schedule_only: 1, provider: 2 };
const SAME_MATCH_WINDOW_MS = 6 * 3_600_000;
const SAME_MATCH_BY_NAME_WINDOW_MS = 3 * 3_600_000;

/**
 * Shared provider fixtures, merged into one canonical row per real match: the same
 * fixture from two providers (same sport, category, both teams, start within 6 h — or,
 * for teams outside the seed, matching names within 3 h) is one row with both provider ids. A lower-authority source (schedule-only
 * community data) never overrides the status of a live-status provider.
 */
export async function upsertMatches(db: DB, rows: MatchUpsert[]): Promise<number> {
  let n = 0;
  for (const { verified, ...r } of rows) {
    const now = new Date();
    const freshnessPolicy = r.status === "finished" ? "final" : r.status === "live" ? "status" : "fixtures";
    const existing = await findCanonical(db, r);
    if (existing) {
      const providerIds = { ...existing.providerIds, [r.provider]: r.externalId };
      // Status follows whoever has the most authority, whichever provider created the row.
      const wins = AUTHORITY[r.statusSource] >= AUTHORITY[existing.statusSource];
      await db
        .update(sportsMatches)
        .set(
          wins
            ? {
                status: r.status,
                statusSource: r.statusSource,
                statusCheckedAt: r.statusCheckedAt,
                resultSummary: r.resultSummary ?? existing.resultSummary,
                startsAt: r.startsAt,
                verifiedAt: verified ? r.statusCheckedAt : existing.verifiedAt,
                freshnessPolicy,
                providerIds,
                competitionId: existing.competitionId ?? r.competitionId ?? null,
                season: existing.season ?? r.season ?? null,
                venue: existing.venue ?? r.venue ?? null,
                fetchedAt: now,
                updatedAt: now,
              }
            : {
                providerIds,
                competitionId: existing.competitionId ?? r.competitionId ?? null,
                season: existing.season ?? r.season ?? null,
                venue: existing.venue ?? r.venue ?? null,
                fetchedAt: now,
                updatedAt: now,
              },
        )
        .where(eq(sportsMatches.id, existing.id));
    } else {
      await db.insert(sportsMatches).values({
        ...r,
        competitionId: r.competitionId ?? null,
        season: r.season ?? null,
        venue: r.venue ?? null,
        category: r.gender,
        providerIds: { [r.provider]: r.externalId },
        fetchedAt: now,
        verifiedAt: verified ? r.statusCheckedAt : null,
        freshnessPolicy,
        ownerId: null,
      });
    }
    n++;
  }
  return n;
}

async function findCanonical(db: DB, r: Omit<MatchUpsert, "verified">): Promise<MatchRow | null> {
  // Same provider id first.
  const [own] = await db.select().from(sportsMatches).where(and(eq(sportsMatches.provider, r.provider), eq(sportsMatches.externalId, r.externalId)));
  if (own) return own;
  const [byId] = await db
    .select()
    .from(sportsMatches)
    .where(and(isNull(sportsMatches.ownerId), sql`${sportsMatches.providerIds} ->> ${r.provider} = ${r.externalId}`));
  if (byId) return byId;
  if (r.homeTeamId && r.awayTeamId) {
    const from = new Date(r.startsAt.getTime() - SAME_MATCH_WINDOW_MS);
    const to = new Date(r.startsAt.getTime() + SAME_MATCH_WINDOW_MS);
    const [same] = await db
      .select()
      .from(sportsMatches)
      .where(
        and(
          isNull(sportsMatches.ownerId),
          eq(sportsMatches.sport, r.sport),
          eq(sportsMatches.gender, r.gender),
          gte(sportsMatches.startsAt, from),
          lte(sportsMatches.startsAt, to),
          or(
            and(eq(sportsMatches.homeTeamId, r.homeTeamId), eq(sportsMatches.awayTeamId, r.awayTeamId)),
            and(eq(sportsMatches.homeTeamId, r.awayTeamId), eq(sportsMatches.awayTeamId, r.homeTeamId)),
          ),
        ),
      );
    if (same) return same;
  }
  // Teams outside the seed (or named differently by each provider): match by name, tighter time window.
  const candidates = await db
    .select()
    .from(sportsMatches)
    .where(
      and(
        isNull(sportsMatches.ownerId),
        eq(sportsMatches.sport, r.sport),
        eq(sportsMatches.gender, r.gender),
        gte(sportsMatches.startsAt, new Date(r.startsAt.getTime() - SAME_MATCH_BY_NAME_WINDOW_MS)),
        lte(sportsMatches.startsAt, new Date(r.startsAt.getTime() + SAME_MATCH_BY_NAME_WINDOW_MS)),
      ),
    );
  return candidates.find((c) => sameFixtureNames(r.homeName, r.awayName, c.homeName, c.awayName)) ?? null;
}

/**
 * One record per real fixture for display and match resolution. Rows stored before two
 * providers were merged can still be duplicates; the most authoritative one is kept.
 */
export function dedupeFixtures(list: MatchRecord[]): MatchRecord[] {
  const kept: MatchRecord[] = [];
  const rank = (m: MatchRecord) => AUTHORITY[m.statusSource] * 1e13 + m.statusCheckedAt.getTime();
  for (const m of [...list].sort((a, b) => rank(b) - rank(a))) {
    const dup = kept.some(
      (k) =>
        k.sport === m.sport &&
        k.gender === m.gender &&
        Math.abs(k.startsAt.getTime() - m.startsAt.getTime()) <= SAME_MATCH_BY_NAME_WINDOW_MS &&
        ((k.homeTeamId && k.homeTeamId === m.homeTeamId && k.awayTeamId === m.awayTeamId) || sameFixtureNames(k.homeName, k.awayName, m.homeName, m.awayName)),
    );
    if (!dup) kept.push(m);
  }
  return kept.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Fixtures a creator can see: shared provider fixtures plus their own entries. */
export async function listMatchesFor(db: DB, userId: string, opts: { sport: Sport; from: Date; to: Date }): Promise<MatchRecord[]> {
  const rows = await db
    .select()
    .from(sportsMatches)
    .where(
      and(
        eq(sportsMatches.sport, opts.sport),
        gte(sportsMatches.startsAt, opts.from),
        lte(sportsMatches.startsAt, opts.to),
        or(isNull(sportsMatches.ownerId), eq(sportsMatches.ownerId, userId)),
      ),
    )
    .orderBy(sportsMatches.startsAt)
    .limit(500);
  return dedupeFixtures(rows.map(toMatchRecord));
}

export async function getMatch(db: DB, userId: string, id: string): Promise<MatchRecord | null> {
  const [row] = await db
    .select()
    .from(sportsMatches)
    .where(and(eq(sportsMatches.id, id), or(isNull(sportsMatches.ownerId), eq(sportsMatches.ownerId, userId))));
  return row ? toMatchRecord(row) : null;
}

/** A fixture typed in by a creator: private to them and always labelled as creator-entered. */
export async function addCreatorMatch(db: DB, userId: string, m: Omit<MatchUpsert, "provider" | "externalId" | "statusSource" | "statusCheckedAt">): Promise<MatchRecord> {
  const [row] = await db
    .insert(sportsMatches)
    .values({ ...m, provider: "creator", externalId: crypto.randomUUID(), statusSource: "creator", statusCheckedAt: new Date(), ownerId: userId })
    .returning();
  return toMatchRecord(row);
}

/** Drops old shared fixtures so the table stays small (creator entries are kept with their account). */
export async function purgeOldMatches(db: DB, before: Date): Promise<void> {
  await db.delete(sportsMatches).where(and(isNull(sportsMatches.ownerId), lt(sportsMatches.startsAt, before)));
}

export async function countMatches(db: DB): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(sportsMatches).where(isNull(sportsMatches.ownerId));
  return r?.n ?? 0;
}

// ---------- References ----------

export type ReferenceRow = typeof platformReferences.$inferSelect;
export type ReferenceInput = {
  platform: string;
  topic: string;
  region?: string;
  url: string | null;
  observedAt: Date;
  evidenceType: ReferenceRow["evidenceType"];
  sourceTool: string;
  note?: string;
  value?: number | null;
};

const REFERENCE_DAYS = 14;

export async function addReferences(db: DB, userId: string | null, rows: ReferenceInput[]): Promise<number> {
  if (!rows.length) return 0;
  await db.insert(platformReferences).values(
    rows.map((r) => ({
      ...r,
      userId,
      region: r.region ?? "IN",
      note: r.note ?? "",
      value: r.value ?? null,
      expiresAt: new Date(r.observedAt.getTime() + REFERENCE_DAYS * 86_400_000),
    })),
  );
  return rows.length;
}

/** References a creator can use: shared (admin) ones plus their own, not expired. */
export async function listReferencesFor(db: DB, userId: string, now = new Date()): Promise<ReferenceRow[]> {
  return db
    .select()
    .from(platformReferences)
    .where(and(gte(platformReferences.expiresAt, now), or(isNull(platformReferences.userId), eq(platformReferences.userId, userId))))
    .orderBy(desc(platformReferences.observedAt))
    .limit(300);
}

export async function listMyReferences(db: DB, userId: string): Promise<ReferenceRow[]> {
  return db.select().from(platformReferences).where(eq(platformReferences.userId, userId)).orderBy(desc(platformReferences.createdAt)).limit(50);
}

export async function listSharedReferences(db: DB): Promise<ReferenceRow[]> {
  return db.select().from(platformReferences).where(isNull(platformReferences.userId)).orderBy(desc(platformReferences.createdAt)).limit(200);
}

export async function deleteMyReference(db: DB, userId: string, id: string): Promise<boolean> {
  const r = await db
    .delete(platformReferences)
    .where(and(eq(platformReferences.id, id), eq(platformReferences.userId, userId)))
    .returning({ id: platformReferences.id });
  return r.length > 0;
}

export async function deleteSharedReference(db: DB, id: string): Promise<void> {
  await db.delete(platformReferences).where(and(eq(platformReferences.id, id), isNull(platformReferences.userId)));
}
