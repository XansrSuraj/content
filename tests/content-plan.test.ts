import { describe, expect, it } from "vitest";
import { contentPlan, fixtureHashtags, fixtureIcs } from "@/lib/domain/sports/content-plan";

const start = new Date("2026-10-21T19:00:00Z");
const at = (h: number) => new Date(start.getTime() + h * 3_600_000);
const current = (stage: "upcoming" | "live" | "completed" | "unknown" | "postponed", now: Date, sport: "cricket" | "football" = "football") =>
  contentPlan({ sport, startsAt: start, stage }, now).find((s) => s.current)?.key ?? null;

describe("match-day content plan", () => {
  it("moves through the posting moments", () => {
    expect(current("upcoming", at(-30))).toBeNull();
    expect(current("upcoming", at(-20))).toBe("preview");
    expect(current("upcoming", at(-3))).toBe("matchday");
    expect(current("upcoming", at(-0.5))).toBe("lineups");
    expect(current("live", at(1))).toBe("live");
  });

  it("result steps wait for a confirmed result", () => {
    expect(current("unknown", at(5))).toBe("live");
    expect(current("completed", at(5))).toBe("fulltime");
    expect(current("completed", at(20))).toBe("analysis");
  });

  it("uses the cricket toss time and has no current step for a postponed match", () => {
    const plan = contentPlan({ sport: "cricket", startsAt: start, stage: "upcoming" }, at(-2));
    expect(plan.find((s) => s.key === "lineups")?.at).toEqual(at(-0.5));
    expect(current("postponed", at(-3))).toBeNull();
  });
});

describe("fixture extras", () => {
  it("builds a calendar event with a reminder a day before", () => {
    const ics = fixtureIcs({ id: "m1", sport: "football", homeName: "Arsenal FC", awayName: "Everton FC", competition: "Premier League", startsAt: start, source: "football-data.org" }, start);
    expect(ics).toContain("DTSTART:20261021T190000Z");
    expect(ics).toContain("DTEND:20261021T210000Z");
    expect(ics).toContain("SUMMARY:Arsenal FC vs Everton FC");
    expect(ics).toContain("TRIGGER:-PT24H");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("hashtags come only from the fixture", () => {
    expect(fixtureHashtags({ sport: "cricket", homeShort: "IND", awayShort: "AUS", homeName: "India", awayName: "Australia", competitionTag: null })).toEqual(["#INDvsAUS", "#India", "#Australia", "#Cricket"]);
    expect(fixtureHashtags({ sport: "football", homeName: "FC Bayern München", awayName: "Arsenal FC", competitionTag: "UCL" })).toEqual([
      "#BayernMunchenvsArsenal",
      "#BayernMunchen",
      "#Arsenal",
      "#UCL",
      "#Football",
    ]);
  });
});
