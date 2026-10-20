import { describe, expect, it } from "vitest";
import { AMBIGUOUS_ALIASES, PLAYERS, TEAMS, teamIdForName } from "@/lib/domain/sports/entities";
import { detectLanguage, parseSportsIntent } from "@/lib/domain/sports/intent";
import { localDay, matchStage, resolveMatch, writingStage, type MatchRecord } from "@/lib/domain/sports/resolve";
import { zonedToUtc } from "@/lib/providers/sports/connectors";

const IST = "Asia/Kolkata";
// Monday 2026-10-19 23:50 IST
const lateNight = zonedToUtc("2026-10-19", "23:50", IST);

function m(over: Partial<MatchRecord>): MatchRecord {
  return {
    id: "m", provider: "test", sport: "cricket", competition: "IPL", competitionId: "cricket:ipl", gender: "men",
    homeTeamId: "cricket:rcb", awayTeamId: "cricket:mi", homeName: "RCB", awayName: "MI",
    startsAt: zonedToUtc("2026-10-20", "19:30", IST), status: "scheduled", statusSource: "provider", statusCheckedAt: lateNight,
    resultSummary: null, url: null, ...over,
  };
}

describe("seed data", () => {
  it("has unique ids and no ambiguous alias listed on a single entity", () => {
    const ids = [...TEAMS.map((t) => t.id), ...PLAYERS.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const amb of AMBIGUOUS_ALIASES) {
      for (const t of TEAMS) expect(t.aliases.map((a) => a.replace(/^~/, "").toLowerCase()), `${amb.alias} on ${t.id}`).not.toContain(amb.alias);
      for (const c of amb.candidates) expect(TEAMS.some((t) => t.id === c) || PLAYERS.some((p) => p.id === c), c).toBe(true);
    }
  });
  it("covers all IPL and WPL franchises", () => {
    expect(TEAMS.filter((t) => t.competitions.includes("cricket:ipl"))).toHaveLength(10);
    expect(TEAMS.filter((t) => t.competitions.includes("cricket:wpl"))).toHaveLength(5);
  });
  it("matches provider names regardless of club affixes", () => {
    expect(teamIdForName("FC Arsenal", "football")).toBe("football:arsenal");
    expect(teamIdForName("Manchester United FC", "football")).toBe("football:manutd");
    expect(teamIdForName("India Women", "cricket")).toBe("cricket:ind_w");
    expect(teamIdForName("Gujarat Giants", "cricket")).toBe("cricket:gg_w");
    expect(teamIdForName("India", "cricket")).toBe("cricket:ind");
  });
});

describe("ambiguous aliases", () => {
  it("'MI ka match kal' stays ambiguous and asks which team", () => {
    const i = parseSportsIntent("MI ka match kal");
    expect(i.teamIds).toEqual([]);
    expect(i.question).toMatchObject({ kind: "which_team", alias: "mi" });
    expect(i.question?.options).toContain("cricket:mi_emirates");
  });
  it("context resolves MI: IPL opponent or Wankhede means Mumbai Indians; SA20 means MI Cape Town", () => {
    expect(parseSportsIntent("MI vs CSK kal khelenge").teamIds.sort()).toEqual(["cricket:csk", "cricket:mi"]);
    expect(parseSportsIntent("Wankhede mein MI ka match aaj").teamIds).toEqual(["cricket:mi"]);
    expect(parseSportsIntent("SA20 mein MI ka match aaj").teamIds).toEqual(["cricket:mi_capetown"]);
  });
  it("'Man U vs United': United cannot be Man United again, so it stays ambiguous", () => {
    const i = parseSportsIntent("Man U vs United match preview");
    expect(i.teamIds).toEqual(["football:manutd"]);
    expect(i.question).toMatchObject({ kind: "which_team", alias: "united" });
    expect(i.question?.options).not.toContain("football:manutd");
  });
  it("Ronaldo: CR7 vs R9 by context, asks when there is no context", () => {
    expect(parseSportsIntent("Ronaldo ka Al Nassr ke liye free kick, siuu").playerIds).toContain("cr7");
    expect(parseSportsIntent("Ronaldo 2002 World Cup Brazil final goals football").playerIds).toContain("r9");
    expect(parseSportsIntent("Ronaldo ka best goal football").question).toMatchObject({ kind: "which_player", alias: "ronaldo" });
  });
});

describe("intent v2", () => {
  it("'Kohli ki 2016 wali century' is a historical highlight", () => {
    const i = parseSportsIntent("Kohli ki 2016 wali century, RCB fans yaad hai?", { now: lateNight });
    expect(i.contentType).toBe("historical_highlight");
    expect(i.year).toBe(2016);
    expect(i.timeRef).toBe("historical");
  });
  it("'kal jo hua' is yesterday and 'kal ka match dekhna' is tomorrow", () => {
    expect(parseSportsIntent("RCB vs MI kal jo hua wo dekho").timeRef).toBe("yesterday");
    expect(parseSportsIntent("RCB vs MI kal ka match dekhna mat bhoolna").timeRef).toBe("tomorrow");
  });
  it("reads parso, aaj raat, explicit dates and women's category", () => {
    expect(parseSportsIntent("RCB vs MI parso khelenge").timeRef).toBe("day_after_tomorrow");
    expect(parseSportsIntent("RCB vs MI aaj raat ka match").timeRef).toBe("today");
    expect(parseSportsIntent("RCB vs MI 21 Oct match preview", { now: lateNight })).toMatchObject({ timeRef: "explicit_date", explicitDate: "2026-10-21" });
    expect(parseSportsIntent("India vs Australia women's ODI preview")).toMatchObject({ category: "women", teamIds: ["cricket:ind_w", "cricket:aus_w"] });
    expect(parseSportsIntent("WPL mein RCB ka match aaj").teamIds).toEqual(["cricket:rcb_w"]);
  });
  it("detects caption language", () => {
    expect(detectLanguage("आज भारत का मैच है")).toBe("hindi");
    expect(detectLanguage("Aaj India ka match hai bhai")).toBe("hinglish");
    expect(detectLanguage("Big night for India tonight")).toBe("english");
  });
  it("reports confidence and competition", () => {
    const i = parseSportsIntent("IPL: RCB vs MI preview, kaun jeetega?");
    expect(i.competitionId).toBe("cricket:ipl");
    expect(i.confidence.sport).toBeGreaterThan(0.9);
    expect(i.confidence.teams).toBeGreaterThan(0.8);
  });
});

describe("resolution", () => {
  const tomorrow = m({ id: "tmr", startsAt: zonedToUtc("2026-10-20", "19:30", IST) });
  const yesterday = m({ id: "yst", startsAt: zonedToUtc("2026-10-18", "19:30", IST), status: "finished", resultSummary: "RCB won" });

  it("at 23:50 IST, 'kal jo hua' is yesterday's match and 'kal ka match dekhna' is tomorrow's", () => {
    expect(resolveMatch(parseSportsIntent("RCB vs MI kal jo hua"), [tomorrow, yesterday], lateNight, IST)).toMatchObject({ kind: "single", match: { id: "yst" } });
    expect(resolveMatch(parseSportsIntent("RCB vs MI kal ka match dekhna"), [tomorrow, yesterday], lateNight, IST)).toMatchObject({ kind: "single", match: { id: "tmr" } });
  });

  it("same two teams twice in 7 days goes to the selector, never the nearest", () => {
    const second = m({ id: "second", startsAt: zonedToUtc("2026-10-24", "15:30", IST) });
    expect(resolveMatch(parseSportsIntent("RCB vs MI preview"), [tomorrow, second], lateNight, IST).kind).toBe("ambiguous");
    // An explicit "next match" is the only nearest-pick allowed.
    expect(resolveMatch(parseSportsIntent("RCB vs MI next match preview"), [tomorrow, second], lateNight, IST)).toMatchObject({ kind: "single", match: { id: "tmr" } });
  });

  it("a historical highlight never attaches to the next RCB match", () => {
    expect(resolveMatch(parseSportsIntent("Kohli ki 2016 wali century, RCB", { now: lateNight }), [tomorrow], lateNight, IST).kind).toBe("none");
  });

  it("a recap never attaches to an upcoming fixture", () => {
    expect(resolveMatch(parseSportsIntent("RCB vs MI highlights recap"), [tomorrow], lateNight, IST).kind).toBe("none");
  });

  it("men's and women's fixtures in the same week stay separate", () => {
    const men = m({ id: "men", competitionId: "cricket:intl", homeTeamId: "cricket:ind", awayTeamId: "cricket:aus", startsAt: zonedToUtc("2026-10-21", "13:30", IST) });
    const women = m({ id: "women", gender: "women", competitionId: "cricket:intl_w", homeTeamId: "cricket:ind_w", awayTeamId: "cricket:aus_w", startsAt: zonedToUtc("2026-10-22", "13:30", IST) });
    expect(resolveMatch(parseSportsIntent("Ind vs Aus preview"), [men, women], lateNight, IST)).toMatchObject({ kind: "single", match: { id: "men" } });
    expect(resolveMatch(parseSportsIntent("Ind vs Aus women's preview"), [men, women], lateNight, IST)).toMatchObject({ kind: "single", match: { id: "women" } });
  });

  it("'MI ka match kal' with fixtures for several MI teams goes to the selector", () => {
    const mie = m({ id: "mie", competitionId: "cricket:ilt20", homeTeamId: "cricket:mi_emirates", awayTeamId: null, homeName: "MI Emirates", awayName: "Gulf Giants", startsAt: zonedToUtc("2026-10-20", "20:00", IST) });
    expect(resolveMatch(parseSportsIntent("MI ka match kal"), [tomorrow, mie, yesterday], lateNight, IST).kind).toBe("ambiguous");
  });
});

describe("time and stage", () => {
  it("UTC/IST boundary: 19:00 UTC Sunday is 00:30 IST Monday", () => {
    const sundayUtc = new Date("2026-10-18T19:00:00Z");
    expect(localDay(sundayUtc, "UTC")).toBe("2026-10-18");
    expect(localDay(sundayUtc, IST)).toBe("2026-10-19");
    // At Monday 10:00 IST that match is "today" for an Indian creator.
    const mondayMorning = zonedToUtc("2026-10-19", "10:00", IST);
    const fx = m({ id: "late", startsAt: sundayUtc, status: "finished" });
    expect(resolveMatch(parseSportsIntent("RCB vs MI aaj ka match recap"), [fx], mondayMorning, IST)).toMatchObject({ kind: "single" });
  });

  it("posting after kick-off while the result is unknown is written neutrally", () => {
    const fx = m({ startsAt: zonedToUtc("2026-10-20", "19:30", IST) });
    expect(matchStage(fx, lateNight)).toBe("upcoming");
    expect(writingStage(fx, lateNight, zonedToUtc("2026-10-21", "09:00", IST))).toBe("unknown");
    expect(writingStage(fx, lateNight, null)).toBe("upcoming");
  });

  it("postponed, cancelled and stale cached status", () => {
    expect(matchStage(m({ status: "postponed" }), lateNight)).toBe("postponed");
    expect(matchStage(m({ status: "cancelled" }), lateNight)).toBe("cancelled");
    expect(matchStage(m({ statusCheckedAt: new Date(lateNight.getTime() - 3 * 86_400_000) }), lateNight)).toBe("unknown");
  });
});

describe("common-word ambiguous aliases", () => {
  it("need a sport-specific signal", () => {
    expect(parseSportsIntent("This was a real match of emotions at my cousin's wedding").sport).toBeNull();
    expect(parseSportsIntent("City lights and a long match day at office").question).toBeNull();
    expect(parseSportsIntent("Real vs Barca El Clasico preview").teamIds).toEqual(expect.arrayContaining(["football:barcelona", "football:realmadrid"]));
  });
});

describe("entity tables", () => {
  it("are filled from the seed on migrate, with ambiguous aliases flagged", async () => {
    const { createTestDb } = await import("./helpers");
    const { syncSportsSeed } = await import("@/lib/db/sync-sports-seed");
    const { entityAliases, sportsTeams } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await createTestDb();
    const res = await syncSportsSeed(db);
    expect(res.teams).toBeGreaterThan(80);
    expect((await db.select().from(sportsTeams)).length).toBe(res.teams);
    const mi = await db.select().from(entityAliases).where(eq(entityAliases.alias, "mi"));
    expect(mi.length).toBeGreaterThanOrEqual(4);
    expect(mi.every((r) => r.ambiguous)).toBe(true);
    // Idempotent.
    expect((await syncSportsSeed(db)).aliases).toBe(res.aliases);
  });
});

describe("creator answers", () => {
  it("an alias choice resolves the ambiguity deterministically", () => {
    const i = parseSportsIntent("MI ka match kal", { aliasChoices: { mi: "cricket:mi_capetown" } });
    expect(i.teamIds).toEqual(["cricket:mi_capetown"]);
    expect(i.question).toBeNull();
  });
});
