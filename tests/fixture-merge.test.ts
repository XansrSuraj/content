import { describe, expect, it } from "vitest";
import { sportsMatches } from "@/lib/db/schema";
import { sameFixtureNames, sameTeamName } from "@/lib/domain/sports/entities";
import { dedupeFixtures, listMatchesFor, toMatchRecord, upsertMatches, type MatchUpsert } from "@/lib/repo/sports";
import { createTestDb, createUser } from "./helpers";

const now = new Date("2026-10-21T06:00:00Z");
const kickoff = new Date("2026-10-21T19:00:00Z");
const row = (over: Partial<MatchUpsert>): MatchUpsert => ({
  provider: "openligadb", externalId: "ol-1", sport: "football", competition: "UEFA Champions League", gender: "men",
  homeTeamId: null, awayTeamId: null, homeName: "Inter Mailand", awayName: "Shakhtar Donetsk",
  startsAt: kickoff, status: "scheduled", statusSource: "schedule_only", statusCheckedAt: now, resultSummary: null, url: null, verified: false, ...over,
});

describe("team names across providers", () => {
  it.each([
    ["Galatasaray Istanbul", "Galatasaray SK"],
    ["Inter Mailand", "FC Internazionale Milano"],
    ["Club Brugge KV", "FC Brügge"],
    ["RC Lens", "Racing Club de Lens"],
    ["LASK", "LASK Linz"],
    ["FC Bayern München", "Bayern Munich"],
  ])("same team: %s / %s", (a, b) => expect(sameTeamName(a, b)).toBe(true));

  it.each([
    ["Leeds United", "Newcastle United"],
    ["Manchester City", "Leicester City"],
    ["Real Madrid", "Real Betis"],
    ["Inter Miami", "Inter Mailand"],
  ])("different teams: %s / %s", (a, b) => expect(sameTeamName(a, b)).toBe(false));

  it("matches a fixture in either order", () => {
    expect(sameFixtureNames("Lille OSC", "Galatasaray Istanbul", "Galatasaray SK", "Lille OSC")).toBe(true);
    expect(sameFixtureNames("Leeds United", "Real Madrid", "Newcastle United", "Real Betis")).toBe(false);
  });
});

describe("merging fixtures of teams outside the seed", () => {
  it("merges the same match from a community feed and a live-status provider", async () => {
    const db = await createTestDb();
    const u = await createUser(db, "merge@example.com");
    await upsertMatches(db, [row({})]);
    await upsertMatches(db, [
      row({ provider: "football_data", externalId: "fd-1", homeName: "FC Internazionale Milano", awayName: "FK Shakhtar Donetsk", statusSource: "provider", verified: true }),
    ]);
    const rows = await db.select().from(sportsMatches);
    expect(rows).toHaveLength(1);
    expect(rows[0].providerIds).toEqual({ openligadb: "ol-1", football_data: "fd-1" });
    expect(rows[0].statusSource).toBe("provider");
    // Shown as football-data.org's match, and later community refreshes still find the same row.
    expect(rows[0].provider).toBe("football_data");
    expect(rows[0].homeName).toBe("FC Internazionale Milano");
    await upsertMatches(db, [row({})]);
    expect(await db.select().from(sportsMatches)).toHaveLength(1);
    expect(await listMatchesFor(db, u.id, { sport: "football", from: new Date("2026-10-20T00:00:00Z"), to: new Date("2026-10-23T00:00:00Z") })).toHaveLength(1);
  });

  it("does not merge different fixtures at the same time", async () => {
    const db = await createTestDb();
    await upsertMatches(db, [
      row({ externalId: "a", homeName: "Leeds United", awayName: "Real Madrid" }),
      row({ externalId: "b", homeName: "Newcastle United", awayName: "Real Betis" }),
    ]);
    expect(await db.select().from(sportsMatches)).toHaveLength(2);
  });

  it("shows one record for duplicates stored before merging existed, preferring the live-status provider", async () => {
    const db = await createTestDb();
    // Two separate rows, as stored by earlier versions (inserted directly so no merge runs).
    const base = { sport: "football" as const, competition: "LaLiga", gender: "men" as const, homeTeamId: null, awayTeamId: null, startsAt: kickoff, status: "scheduled" as const, statusCheckedAt: now, resultSummary: null, url: null, category: "men" as const, ownerId: null, fetchedAt: now, freshnessPolicy: "fixtures" as const };
    await db.insert(sportsMatches).values([
      { ...base, provider: "openfootball", externalId: "of-1", homeName: "Levante UD", awayName: "Athletic Club", statusSource: "schedule_only", providerIds: { openfootball: "of-1" } },
      { ...base, provider: "football_data", externalId: "fd-2", homeName: "Levante UD", awayName: "Athletic Club", statusSource: "provider", providerIds: { football_data: "fd-2" } },
    ]);
    const kept = dedupeFixtures((await db.select().from(sportsMatches)).map(toMatchRecord));
    expect(kept).toHaveLength(1);
    expect(kept[0].provider).toBe("football_data");
  });
});
