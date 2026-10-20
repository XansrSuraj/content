import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { platformReferences, sportsMatches } from "@/lib/db/schema";
import type { MatchRecord, MatchStatus, StatusSource } from "@/lib/domain/sports/resolve";
import type { Sport } from "@/lib/domain/sports/entities";

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
}

/** Shared provider fixtures: one row per provider match, updated in place. */
export async function upsertMatches(db: DB, rows: MatchUpsert[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    await db
      .insert(sportsMatches)
      .values({ ...r, ownerId: null })
      .onConflictDoUpdate({
        target: [sportsMatches.provider, sportsMatches.externalId],
        set: {
          competition: r.competition,
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
          updatedAt: new Date(),
        },
      });
    n++;
  }
  return n;
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
  return rows.map(toMatchRecord);
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
