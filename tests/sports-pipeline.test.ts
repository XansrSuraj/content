import { afterEach, describe, expect, it, vi } from "vitest";
import { CricApiConnector, FootballDataConnector, OpenFootballConnector, cricApiStatus, footballDataStatus, footballSeason, zonedToUtc } from "@/lib/providers/sports/connectors";
import { parseTrendsCsv } from "@/lib/domain/trends-csv";
import { classifyHashtags, compactTerm, type HashtagEvidence } from "@/lib/domain/hashtags";
import { runSportsIngestion } from "@/lib/jobs/sports-ingest";
import { addCreatorMatch, addReferences, listMatchesFor, upsertMatches } from "@/lib/repo/sports";
import { runCaptionTurn } from "@/lib/services/captions";
import type { CaptionProvider, CaptionRequest } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleResult } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());
const now = new Date("2026-10-20T06:30:00Z");

function stubJson(byUrl: (url: string) => unknown) {
  const fn = vi.fn<(url: string | URL | Request) => Promise<Response>>(async (url) => {
    const body = byUrl(String(url));
    return body === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("time helpers", () => {
  it("converts venue time to UTC across DST", () => {
    expect(zonedToUtc("2026-10-10", "12:30", "Europe/London").toISOString()).toBe("2026-10-10T11:30:00.000Z");
    expect(zonedToUtc("2026-11-10", "12:30", "Europe/London").toISOString()).toBe("2026-11-10T12:30:00.000Z");
    expect(zonedToUtc("2026-10-21", "19:30", "Asia/Kolkata").toISOString()).toBe("2026-10-21T14:00:00.000Z");
  });
  it("picks the football season", () => {
    expect(footballSeason(new Date("2026-10-20T00:00:00Z"))).toBe("2026-27");
    expect(footballSeason(new Date("2027-03-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("openfootball", () => {
  it("keeps the window, maps teams, and never marks a fixture live", async () => {
    stubJson((url) =>
      url.includes("/en.1.json")
        ? {
            name: "English Premier League 2026/27",
            matches: [
              { date: "2026-10-18", time: "15:00", team1: "Arsenal FC", team2: "Chelsea FC", score: { ft: [2, 1] } },
              { date: "2026-10-24", time: "17:30", team1: "Liverpool FC", team2: "Manchester City FC" },
              { date: "2026-12-26", time: "15:00", team1: "Arsenal FC", team2: "Liverpool FC" },
            ],
          }
        : undefined,
    );
    const rows = await new OpenFootballConnector("UA").fetch(AbortSignal.timeout(1000), now);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ homeTeamId: "football:arsenal", awayTeamId: "football:chelsea", status: "finished", statusSource: "schedule_only", resultSummary: "Arsenal FC 2–1 Chelsea FC (full time)" });
    expect(rows[1]).toMatchObject({ homeTeamId: "football:liverpool", awayTeamId: "football:mancity", status: "scheduled" });
    expect(rows.every((r) => r.status !== "live")).toBe(true);
  });
});

describe("keyed providers", () => {
  it("maps football-data.org statuses and scores", async () => {
    expect(["TIMED", "IN_PLAY", "FINISHED", "POSTPONED", "SUSPENDED", "WHAT"].map(footballDataStatus)).toEqual(["scheduled", "live", "finished", "postponed", "cancelled", "unknown"]);
    stubJson(() => ({
      matches: [
        { id: 7, utcDate: "2026-10-19T19:00:00Z", status: "FINISHED", competition: { name: "Primera Division" }, homeTeam: { name: "Real Madrid CF" }, awayTeam: { name: "FC Barcelona" }, score: { fullTime: { home: 1, away: 2 } } },
      ],
    }));
    const [m] = await new FootballDataConnector("tok").fetch(AbortSignal.timeout(1000), now);
    expect(m).toMatchObject({ homeTeamId: "football:realmadrid", awayTeamId: "football:barcelona", status: "finished", statusSource: "provider", resultSummary: "Real Madrid CF 1–2 FC Barcelona (full time)" });
  });

  it("maps CricAPI matches, including women's and live", async () => {
    expect(cricApiStatus({ matchStarted: true, matchEnded: false })).toBe("live");
    expect(cricApiStatus({ matchEnded: true, status: "Match abandoned" })).toBe("cancelled");
    stubJson((url) =>
      url.includes("currentMatches")
        ? {
            status: "success",
            data: [
              { id: "a", name: "India vs Australia, 2nd ODI", status: "India won by 5 wkts", dateTimeGMT: "2026-10-19T08:00:00", teams: ["India", "Australia"], matchStarted: true, matchEnded: true, series: "Australia tour of India" },
              { id: "b", name: "India Women vs England Women, 1st T20I", status: "Match not started", dateTimeGMT: "2026-10-21T13:30:00", teams: ["India Women", "England Women"], matchStarted: false, matchEnded: false },
            ],
          }
        : { status: "success", data: [] },
    );
    const rows = await new CricApiConnector("k").fetch(AbortSignal.timeout(1000), now);
    expect(rows.find((r) => r.externalId === "a")).toMatchObject({ homeTeamId: "cricket:ind", awayTeamId: "cricket:aus", status: "finished", resultSummary: "India won by 5 wkts", gender: "men" });
    expect(rows.find((r) => r.externalId === "b")).toMatchObject({ gender: "women", homeTeamId: "cricket:ind", awayTeamId: "cricket:eng", status: "scheduled" });
  });

  it("respects the daily call cap", async () => {
    const db = await createTestDb();
    stubJson(() => ({ status: "success", data: [] }));
    const c = new CricApiConnector("k");
    c.minIntervalMinutes = 0;
    c.dailyCallCap = 4; // 2 calls per run → 2 runs allowed
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await runSportsIngestion(db, c, { now: new Date(now.getTime() + i * 1000) })).status);
    expect(results).toEqual(["success", "success", "skipped"]);
  });
});

describe("Google Trends CSV", () => {
  it("reads TOP and RISING sections", () => {
    const csv = `Category: All categories\n\nTOP\nquery,value\nind vs aus,100\n"virat kohli, century",45\n\nRISING\nquery,value\nind vs aus playing 11,Breakout\nkohli 50,+350%\n`;
    expect(parseTrendsCsv(csv)).toEqual([
      { query: "ind vs aus", section: "top", value: 100, label: "100" },
      { query: "virat kohli, century", section: "top", value: 45, label: "45" },
      { query: "ind vs aus playing 11", section: "rising", value: null, label: "Breakout" },
      { query: "kohli 50", section: "rising", value: 350, label: "+350%" },
    ]);
  });
});

describe("three hashtag labels", () => {
  const ev = (over: Partial<HashtagEvidence>): HashtagEvidence => ({ sourceKey: "s", sourceName: "S", platform: "instagram", geo: "IN", observedAt: now, retrievedAt: now, coverageNote: "x", url: null, isDemo: false, ...over });
  it("platform trend beats search interest, which beats suggestion — and Google never verifies", () => {
    const platform = new Map([["#indvsaus", [ev({})]]]);
    const search = new Map([[compactTerm("ind vs aus"), [ev({ platform: "google_search", sourceKey: "google_trends_rss_in" })]]]);
    const [a] = classifyHashtags(["#INDvsAUS"], platform, "instagram_reels", now, search);
    expect(a.status).toBe("verified");
    const [b] = classifyHashtags(["#INDvsAUS", "#Cricket"], new Map(), "instagram_reels", now, search);
    expect(b.status).toBe("search_interest");
    expect(classifyHashtags(["#Cricket"], new Map(), "instagram_reels", now, search)[0].status).toBe("suggested");
    // Stale search interest does not count.
    const old = new Map([[compactTerm("ind vs aus"), [ev({ observedAt: new Date(now.getTime() - 72 * 3_600_000) })]]]);
    expect(classifyHashtags(["#INDvsAUS"], new Map(), "instagram_reels", now, old)[0].status).toBe("suggested");
  });
});

/** 19:30 / 15:00 IST on the IST calendar day `offset` days from today (fixtures follow the creator's calendar). */
function istDay(offset: number, time: string): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  return zonedToUtc(day, time, "Asia/Kolkata");
}

describe("caption turn with match context", () => {
  function recorder() {
    const seen: CaptionRequest[] = [];
    const provider: CaptionProvider = {
      name: "rec",
      async generate(req) {
        seen.push(req);
        return { data: sampleResult(), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
      },
    };
    return { seen, provider };
  }
  const fixture = (over: Partial<Parameters<typeof upsertMatches>[1][number]>) => ({
    provider: "cricapi",
    externalId: "x",
    sport: "cricket" as const,
    competition: "Australia tour of India",
    gender: "men" as const,
    homeTeamId: "cricket:ind",
    awayTeamId: "cricket:aus",
    homeName: "India",
    awayName: "Australia",
    startsAt: istDay(1, "19:30"),
    status: "scheduled" as const,
    statusSource: "provider" as const,
    statusCheckedAt: new Date(),
    resultSummary: null,
    url: null,
    ...over,
  });

  it("attaches the one fitting match with its stage rule, and stores it on the message", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "s1@example.com");
    await upsertMatches(db, [fixture({})]);
    const { seen, provider } = recorder();
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "IND vs AUS kal khelenge, preview caption do", opportunityId: null }, provider);
    expect(res.ok).toBe(true);
    const notes = seen[0].evidenceNotes.join("\n");
    expect(notes).toMatch(/MATCH \(from CricketData.org/);
    expect(notes).toMatch(/Verified stage: upcoming/);
    expect(notes).toMatch(/Never state or imply a result/);
    if (res.ok) expect(res.value.assistantMessage.sports?.match?.homeName).toBe("India");
  });

  it("asks which match when 'kal' fits yesterday and tomorrow, and uses no match facts", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "s2@example.com");
    await upsertMatches(db, [
      fixture({ externalId: "next" }),
      fixture({ externalId: "prev", startsAt: istDay(-1, "15:00"), status: "finished", resultSummary: "India won by 5 wkts" }),
    ]);
    const { seen, provider } = recorder();
    const res = await runCaptionTurn(db, user, { conversationId: null, message: "India Australia kal match ka caption", opportunityId: null }, provider);
    expect(seen[0].evidenceNotes.join("\n")).toMatch(/MATCH UNCONFIRMED/);
    expect(seen[0].evidenceNotes.join("\n")).not.toMatch(/won by 5/);
    if (res.ok) expect(res.value.assistantMessage.sports?.candidates).toHaveLength(2);
  });

  it("keeps creator-entered matches private and labels creator references as unverified", async () => {
    const db = await createTestDb();
    const a = await createUser(db, "a@example.com");
    const b = await createUser(db, "b@example.com");
    const m = await addCreatorMatch(db, a.id, {
      sport: "cricket", competition: "Gully league", gender: "men", homeTeamId: "cricket:ind", awayTeamId: "cricket:pak",
      homeName: "India", awayName: "Pakistan", startsAt: new Date(Date.now() + 3_600_000), status: "scheduled", resultSummary: null, url: null,
    });
    const range = { sport: "cricket" as const, from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) };
    expect((await listMatchesFor(db, a.id, range)).map((x) => x.id)).toContain(m.id);
    expect((await listMatchesFor(db, b.id, range)).map((x) => x.id)).not.toContain(m.id);

    await addReferences(db, a.id, [{ platform: "instagram", topic: "India Pakistan reels", url: "https://instagram.com/reel/x", observedAt: new Date(), evidenceType: "creator_reference", sourceTool: "creator" }]);
    const { seen, provider } = recorder();
    await runCaptionTurn(db, a, { conversationId: null, message: "India vs Pakistan preview", opportunityId: null, context: { matchId: m.id } }, provider);
    const notes = seen[0].evidenceNotes.join("\n");
    expect(notes).toMatch(/the creator \(not independently verified\)/);
    expect(notes).toMatch(/REFERENCE \(creator-provided, not verified\)/);
  });
});

describe("trend relevance", () => {
  it("does not attach trends that only share generic words", async () => {
    const { matchTrends } = await import("@/lib/services/trend-context");
    const obs = (title: string) => ({ title, sourceKey: "wikimedia_top_in", platform: "wikipedia", geo: "IN", observedAt: now, metricName: null, metricValue: null, url: null, isDemo: false });
    const text = "India vs Pakistan kal khelenge — preview reel caption do";
    const got = matchTrends(text, [obs("Match cut"), obs("India at the 2026 Asian Para Games"), obs("India–Pakistan cricket rivalry")]).map((i) => i.title);
    expect(got).toEqual(["India–Pakistan cricket rivalry"]);
  });
});
