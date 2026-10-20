import type { DB } from "./client";
import { entityAliases, sportsCatalog, sportsCompetitions, sportsPlayers, sportsTeams } from "./schema";
import { AMBIGUOUS_ALIASES, COMPETITIONS, PLAYERS, TEAMS, aliasText, isWeak, scriptOf } from "@/lib/domain/sports/entities";

/**
 * Mirrors the reviewable seed files into the sports entity tables. Idempotent:
 * entities are upserted, and the alias table (a derived index) is rebuilt.
 */
export async function syncSportsSeed(db: DB): Promise<{ teams: number; players: number; aliases: number }> {
  const now = new Date();
  for (const s of [
    { id: "cricket", name: "Cricket" },
    { id: "football", name: "Football" },
  ]) {
    await db.insert(sportsCatalog).values(s).onConflictDoUpdate({ target: sportsCatalog.id, set: { name: s.name } });
  }
  for (const c of COMPETITIONS) {
    await db
      .insert(sportsCompetitions)
      .values({ id: c.id, sport: c.sport, name: c.name, format: c.format, category: c.category })
      .onConflictDoUpdate({ target: sportsCompetitions.id, set: { name: c.name, format: c.format, category: c.category, updatedAt: now } });
  }
  for (const t of TEAMS) {
    await db
      .insert(sportsTeams)
      .values({ id: t.id, sport: t.sport, name: t.name, short: t.short, kind: t.kind, category: t.category, competitions: t.competitions })
      .onConflictDoUpdate({ target: sportsTeams.id, set: { name: t.name, short: t.short, kind: t.kind, category: t.category, competitions: t.competitions, updatedAt: now } });
  }
  for (const p of PLAYERS) {
    await db
      .insert(sportsPlayers)
      .values({ id: p.id, sport: p.sport, name: p.name, category: p.category })
      .onConflictDoUpdate({ target: sportsPlayers.id, set: { name: p.name, category: p.category, updatedAt: now } });
  }

  type AliasRow = typeof entityAliases.$inferInsert;
  const rows: AliasRow[] = [];
  const add = (alias: string, entityType: AliasRow["entityType"], entityId: string, ambiguous = false) =>
    rows.push({ alias: aliasText(alias).toLowerCase(), script: scriptOf(alias), entityType, entityId, weak: isWeak(alias), ambiguous });
  for (const t of TEAMS) for (const a of t.aliases) add(a, "team", t.id);
  for (const p of PLAYERS) for (const a of p.aliases) add(a, "player", p.id);
  for (const c of COMPETITIONS) for (const a of c.aliases) add(a, "competition", c.id);
  for (const amb of AMBIGUOUS_ALIASES) for (const c of amb.candidates) add(amb.alias, amb.kind, c, true);

  await db.delete(entityAliases);
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.alias}|${r.entityType}|${r.entityId}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  for (let i = 0; i < unique.length; i += 200) await db.insert(entityAliases).values(unique.slice(i, i + 200));
  return { teams: TEAMS.length, players: PLAYERS.length, aliases: unique.length };
}
