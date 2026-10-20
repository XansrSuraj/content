import { describe, expect, it } from "vitest";
import { teamIdForName } from "@/lib/domain/sports/entities";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { localDay, matchStage, resolveMatch, type MatchRecord } from "@/lib/domain/sports/resolve";

// 2026-10-20 12:00 IST
const now = new Date("2026-10-20T06:30:00Z");

function match(over: Partial<MatchRecord>): MatchRecord {
  return {
    id: over.id ?? "m1",
    provider: "test",
    sport: "cricket",
    competition: "Test series",
    gender: "men",
    homeTeamId: "cricket:ind",
    awayTeamId: "cricket:aus",
    homeName: "India",
    awayName: "Australia",
    startsAt: new Date("2026-10-21T08:00:00Z"),
    status: "scheduled",
    statusSource: "provider",
    statusCheckedAt: now,
    resultSummary: null,
    url: null,
    ...over,
  };
}

describe("aliases", () => {
  it("maps provider names and aliases to one team id", () => {
    expect(teamIdForName("Arsenal FC", "football")).toBe("football:arsenal");
    expect(teamIdForName("Royal Challengers Bangalore", "cricket")).toBe("cricket:rcb");
    expect(teamIdForName("Some Unknown FC", "football")).toBeNull();
  });
});

describe("intent", () => {
  it("reads teams, player, content type and time", () => {
    const i = parseSportsIntent("Aaj India vs Australia match ka preview, Virat Kohli pe nazar rahegi");
    expect(i).toMatchObject({ sport: "cricket", teamIds: ["cricket:ind", "cricket:aus"], playerIds: ["kohli"], contentType: "preview", timeRef: "today" });
  });

  it("understands abbreviations and Hindi spellings", () => {
    expect(parseSportsIntent("IND vs AUS kal khelenge").teamIds).toEqual(["cricket:ind", "cricket:aus"]);
    expect(parseSportsIntent("आरसीबी और सीएसके का मैच").teamIds.sort()).toEqual(["cricket:csk", "cricket:rcb"]);
  });

  it("resolves 'kal' by tense, and leaves it open when unclear", () => {
    expect(parseSportsIntent("Kal India jeet gaye, kya match tha").timeRef).toBe("yesterday");
    expect(parseSportsIntent("Kal India Australia se khelenge").timeRef).toBe("tomorrow");
    expect(parseSportsIntent("India Australia kal match").timeRef).toBe("kal_ambiguous");
  });

  it("does not treat everyday words as sports", () => {
    expect(parseSportsIntent("India ka best street food, Bengaluru mein").sport).toBeNull();
    expect(parseSportsIntent("Hardik shubhkamnayein! Virat roop dekho").sport).toBeNull();
    expect(parseSportsIntent("Naya haar design, shaadi special").sport).toBeNull();
  });

  it("detects women's matches and missing details", () => {
    const i = parseSportsIntent("Women's cricket world cup ka mahaul");
    expect(i.gender).toBe("women");
    expect(i.missing).toContain("teams");
  });
});

describe("stage", () => {
  it("never assumes live from the clock alone", () => {
    const started = match({ startsAt: new Date(now.getTime() - 3_600_000) });
    expect(matchStage(started, now)).toBe("unknown");
    expect(matchStage({ ...started, status: "live" }, now)).toBe("live");
    expect(matchStage({ ...started, status: "live", statusCheckedAt: new Date(now.getTime() - 3_600_000) }, now)).toBe("unknown");
    expect(matchStage({ ...started, status: "live", statusSource: "schedule_only" }, now)).toBe("unknown");
    expect(matchStage(match({}), now)).toBe("upcoming");
    expect(matchStage(match({ status: "finished" }), now)).toBe("completed");
  });

  it("uses the creator's timezone for days", () => {
    expect(localDay(new Date("2026-10-20T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-21");
    expect(localDay(new Date("2026-10-20T20:00:00Z"), "UTC")).toBe("2026-10-20");
  });
});

describe("resolve", () => {
  const yesterday = match({ id: "past", startsAt: new Date("2026-10-19T08:00:00Z"), status: "finished", resultSummary: "India won by 5 wickets" });
  const tomorrow = match({ id: "next", startsAt: new Date("2026-10-21T08:00:00Z") });
  const women = match({ id: "w", gender: "women", homeTeamId: "cricket:ind_w", awayTeamId: "cricket:aus_w", startsAt: new Date("2026-10-21T08:00:00Z") });
  const all = [yesterday, tomorrow, women];

  it("picks the recap for past tense and the preview for future tense", () => {
    expect(resolveMatch(parseSportsIntent("Kal India Australia se jeet gaye"), all, now)).toMatchObject({ kind: "single", match: { id: "past" } });
    expect(resolveMatch(parseSportsIntent("Kal India Australia se khelenge"), all, now)).toMatchObject({ kind: "single", match: { id: "next" } });
  });

  it("asks to confirm when kal is ambiguous", () => {
    const r = resolveMatch(parseSportsIntent("India Australia kal match"), all, now);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates.map((c) => c.id).sort()).toEqual(["next", "past"]);
  });

  it("does not mix men's and women's fixtures", () => {
    expect(resolveMatch(parseSportsIntent("India vs Australia women's match preview"), all, now)).toMatchObject({ kind: "single", match: { id: "w" } });
  });

  it("uses content type when there is no time word", () => {
    expect(resolveMatch(parseSportsIntent("India vs Australia prediction: kaun jeetega?"), all, now)).toMatchObject({ kind: "single", match: { id: "next" } });
    expect(resolveMatch(parseSportsIntent("India vs Australia highlights reaction"), all, now)).toMatchObject({ kind: "single", match: { id: "past" } });
  });

  it("returns none rather than guessing", () => {
    expect(resolveMatch(parseSportsIntent("Pakistan vs England preview"), all, now).kind).toBe("none");
    expect(resolveMatch(parseSportsIntent("Cricket ka mahaul"), all, now).kind).toBe("none");
  });
});
