import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { FootballDataProvider, OpenLigaDbProvider, RateLimitedError, getJson } from "@/lib/providers/sports/connectors";
import { dueIntervalMinutes, runSportsIngestion } from "@/lib/jobs/sports-ingest";
import { reserveCalls, usageToday } from "@/lib/repo/provider-usage";
import { listMatchesFor, upsertMatches, type MatchUpsert } from "@/lib/repo/sports";
import { sources, sportsMatches } from "@/lib/db/schema";
import { createTestDb, createUser } from "./helpers";

afterEach(() => vi.unstubAllGlobals());
const now = new Date("2026-10-20T06:30:00Z");
const RANGE = { from: new Date(now.getTime() - 10 * 86_400_000), to: new Date(now.getTime() + 14 * 86_400_000) };

function stub(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn<(url: string | URL | Request) => Promise<Response>>(async (url) => handler(String(url)));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const OL = (over: Record<string, unknown>) => ({
  matchID: 1, matchDateTimeUTC: "2026-10-24T14:00:00Z", matchIsFinished: false, leagueShortcut: "pl",
  team1: { teamName: "FC Arsenal" }, team2: { teamName: "Everton FC" }, matchResults: [], location: null, ...over,
});

describe("OpenLigaDB", () => {
  it("maps German names, marks finished only with a final result, and is never live", async () => {
    stub((url) =>
      url.includes("/pl/")
        ? json([
            OL({}),
            OL({ matchID: 2, matchDateTimeUTC: "2026-10-18T14:00:00Z", matchIsFinished: true, team1: { teamName: "Inter Mailand" }, team2: { teamName: "AC Mailand" }, matchResults: [{ resultTypeID: 2, pointsTeam1: 1, pointsTeam2: 1 }] }),
            // Kicked off, partial result entered, not finished: stays scheduled (stage → unknown).
            OL({ matchID: 3, matchDateTimeUTC: "2026-10-20T05:00:00Z", matchResults: [{ resultTypeID: 2, pointsTeam1: 2, pointsTeam2: 0 }] }),
          ])
        : json([]),
    );
    const rows = await new OpenLigaDbProvider("UA").listFixtures(RANGE, AbortSignal.timeout(1000), now);
    expect(rows.find((r) => r.externalId === "1")).toMatchObject({ homeTeamId: "football:arsenal", awayTeamId: "football:everton", competitionId: "football:pl", status: "scheduled", statusSource: "schedule_only", verified: false });
    expect(rows.find((r) => r.externalId === "2")).toMatchObject({ homeTeamId: "football:inter", awayTeamId: "football:acmilan", status: "finished" });
    expect(rows.find((r) => r.externalId === "2")?.resultSummary).toMatch(/community data/);
    expect(rows.find((r) => r.externalId === "3")?.status).toBe("scheduled");
    expect(rows.every((r) => r.status !== "live")).toBe(true);
  });
});

describe("HTTP semantics", () => {
  it("404 is empty, 429 carries Retry-After, 5xx is retryable", async () => {
    stub(() => new Response("", { status: 404 }));
    expect(await getJson("https://x.test", { signal: AbortSignal.timeout(1000) })).toBeNull();
    stub(() => new Response("", { status: 429, headers: { "retry-after": "120" } }));
    const err = (await getJson("https://x.test", { signal: AbortSignal.timeout(1000) }).catch((e) => e)) as RateLimitedError;
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.retryAfterSeconds).toBe(120);
    stub(() => new Response("", { status: 503 }));
    await expect(getJson("https://x.test", { signal: AbortSignal.timeout(1000) })).rejects.toMatchObject({ retryable: true });
  });

  it("football-data spends its 10-day window on yesterday and the coming days", async () => {
    const fn = stub(() => json({ matches: [] }));
    const at = new Date("2026-10-21T06:00:00Z");
    // The ingest job asks for 10 days back to 14 days ahead.
    await new FootballDataProvider("t").listFixtures({ from: new Date("2026-10-11T06:00:00Z"), to: new Date("2026-11-04T06:00:00Z") }, AbortSignal.timeout(1000), at);
    const url = new URL(String(fn.mock.calls[0][0]));
    expect([url.searchParams.get("dateFrom"), url.searchParams.get("dateTo")]).toEqual(["2026-10-20", "2026-10-29"]);
  });

  it("football-data getMatch maps one match", async () => {
    stub(() => json({ id: 9, utcDate: "2026-10-20T19:00:00Z", status: "IN_PLAY", competition: { name: "Premier League", code: "PL" }, homeTeam: { name: "Arsenal FC" }, awayTeam: { name: "Chelsea FC" } }));
    const m = await new FootballDataProvider("t").getMatch("9", AbortSignal.timeout(1000), now);
    expect(m).toMatchObject({ status: "live", statusSource: "provider", competitionId: "football:pl", homeTeamId: "football:arsenal", verified: true });
  });
});

const base = (over: Partial<MatchUpsert>): MatchUpsert => ({
  provider: "openligadb", externalId: "ol-1", sport: "football", competition: "Premier League", competitionId: "football:pl", gender: "men",
  homeTeamId: "football:arsenal", awayTeamId: "football:everton", homeName: "FC Arsenal", awayName: "Everton FC",
  startsAt: new Date("2026-10-24T14:00:00Z"), status: "scheduled", statusSource: "schedule_only", statusCheckedAt: now, resultSummary: null, url: null, verified: false, ...over,
});

describe("canonical matches", () => {
  it("merges the same match from two providers into one row with both ids", async () => {
    const db = await createTestDb();
    const u = await createUser(db, "c1@example.com");
    await upsertMatches(db, [base({})]);
    await upsertMatches(db, [base({ provider: "football_data", externalId: "fd-9", statusSource: "provider", status: "live", startsAt: new Date("2026-10-24T14:00:00Z"), verified: true, homeName: "Arsenal FC" })]);
    const rows = await db.select().from(sportsMatches);
    expect(rows).toHaveLength(1);
    expect(rows[0].providerIds).toEqual({ openligadb: "ol-1", football_data: "fd-9" });
    expect(rows[0].status).toBe("live");
    // Community data later says "scheduled": it must not override the live-status provider.
    await upsertMatches(db, [base({})]);
    const [after] = await db.select().from(sportsMatches);
    expect(after.status).toBe("live");
    expect(after.statusSource).toBe("provider");
    expect(await listMatchesFor(db, u.id, { sport: "football", from: RANGE.from, to: RANGE.to })).toHaveLength(1);
  });

  it("keeps two different fixtures of the same teams apart", async () => {
    const db = await createTestDb();
    await upsertMatches(db, [base({}), base({ externalId: "ol-2", startsAt: new Date("2026-10-28T19:00:00Z") })]);
    expect(await db.select().from(sportsMatches)).toHaveLength(2);
  });
});

describe("quota ledger and scheduling", () => {
  it("enforces day and minute budgets shared by everyone", async () => {
    const db = await createTestDb();
    expect((await reserveCalls(db, "p", 2, { perDay: 3, perMinute: 10 }, now)).ok).toBe(true);
    expect((await reserveCalls(db, "p", 2, { perDay: 3, perMinute: 10 }, now)).ok).toBe(false);
    expect((await usageToday(db, now)).get("p")).toBe(2);
    expect((await reserveCalls(db, "q", 2, { perDay: 100, perMinute: 2 }, now)).ok).toBe(true);
    expect((await reserveCalls(db, "q", 1, { perDay: 100, perMinute: 2 }, now)).ok).toBe(false);
    expect((await reserveCalls(db, "q", 1, { perDay: 100, perMinute: 2 }, new Date(now.getTime() + 61_000))).ok).toBe(true);
  });

  it("polls faster while a match is in its play window", async () => {
    const db = await createTestDb();
    const p = new OpenLigaDbProvider("UA");
    expect(await dueIntervalMinutes(db, p, now)).toBe(p.intervals.fixturesMin);
    await upsertMatches(db, [base({ startsAt: new Date(now.getTime() - 30 * 60_000) })]);
    expect(await dueIntervalMinutes(db, p, now)).toBe(p.intervals.liveMin);
  });

  it("a failed refresh keeps the last good data and last success time", async () => {
    const db = await createTestDb();
    stub((url) => (url.includes("/pl/") ? json([OL({})]) : json([])));
    const p = new OpenLigaDbProvider("UA");
    expect((await runSportsIngestion(db, p, { now })).status).toBe("success");
    const before = await db.select().from(sportsMatches);
    stub(() => new Response("", { status: 500 }));
    const later = new Date(now.getTime() + 3 * 3_600_000);
    expect((await runSportsIngestion(db, p, { now: later })).status).toBe("failed");
    expect(await db.select().from(sportsMatches)).toEqual(before);
    const [src] = await db.select().from(sources).where(eq(sources.key, "openligadb"));
    expect(src.lastSuccessAt?.toISOString()).toBe(now.toISOString());
    expect(src.lastError).toMatch(/HTTP 500/);
  });

  it("an empty response is a success, not an error", async () => {
    const db = await createTestDb();
    stub(() => json([]));
    expect(await runSportsIngestion(db, new OpenLigaDbProvider("UA"), { now })).toMatchObject({ status: "success", matches: 0 });
  });
});
