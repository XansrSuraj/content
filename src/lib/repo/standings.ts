import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { sportsStandings } from "@/lib/db/schema";
import type { FetchedStandings } from "@/lib/providers/sports/connectors";

export type Standings = typeof sportsStandings.$inferSelect;

/** Replaces one competition's table (last-known-good: only called after a successful fetch). */
export async function saveStandings(db: DB, provider: string, s: FetchedStandings, fetchedAt: Date): Promise<void> {
  const values = { provider, ...s, fetchedAt };
  await db
    .insert(sportsStandings)
    .values(values)
    .onConflictDoUpdate({ target: [sportsStandings.provider, sportsStandings.competitionCode], set: values });
}

export async function listStandings(db: DB, codes?: readonly string[]): Promise<Standings[]> {
  const rows = codes ? await db.select().from(sportsStandings).where(inArray(sportsStandings.competitionCode, [...codes])) : await db.select().from(sportsStandings);
  return rows.filter((r) => r.rows.length > 0);
}

export async function standingsForCompetition(db: DB, competitionId: string): Promise<Standings | null> {
  const [row] = await db.select().from(sportsStandings).where(eq(sportsStandings.competitionId, competitionId)).limit(1);
  return row ?? null;
}
