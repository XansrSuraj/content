import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshStandingsIfStale } from "@/lib/jobs/standings";
import { listStandings, standingsForCompetition } from "@/lib/repo/standings";
import { createTestDb } from "./helpers";

const now = new Date("2026-10-21T06:00:00Z");
const table = (name: string, leader: string) => ({
  competition: { name },
  season: { startDate: "2026-08-15" },
  standings: [
    { type: "HOME", table: [] },
    {
      type: "TOTAL",
      table: [
        { position: 1, team: { name: leader }, playedGames: 7, won: 7, draw: 0, lost: 0, goalDifference: 12, points: 21 },
        { position: 2, team: { name: "Arsenal FC" }, playedGames: 7, won: 6, draw: 0, lost: 1, goalDifference: 6, points: 18 },
      ],
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe("league tables", () => {
  it("stores the TOTAL table per competition, then waits 6 hours before fetching again", async () => {
    const db = await createTestDb();
    const fn = vi.fn<(url: string | URL | Request) => Promise<Response>>(async () => new Response(JSON.stringify(table("Premier League", "Manchester City FC")), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    await refreshStandingsIfStale(db, { now, env: { FOOTBALL_DATA_TOKEN: "t" } });
    expect(fn).toHaveBeenCalledTimes(6);
    expect(String(fn.mock.calls[0][0])).toContain("/v4/competitions/PL/standings");
    const pl = await standingsForCompetition(db, "football:pl");
    expect(pl?.rows.map((r) => [r.position, r.team, r.points])).toEqual([
      [1, "Manchester City FC", 21],
      [2, "Arsenal FC", 18],
    ]);
    await refreshStandingsIfStale(db, { now: new Date(now.getTime() + 3_600_000), env: { FOOTBALL_DATA_TOKEN: "t" } });
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it("keeps the last good table when a refresh fails, and does nothing without a token", async () => {
    const db = await createTestDb();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(table("Premier League", "Liverpool FC")), { status: 200 })));
    await refreshStandingsIfStale(db, { now, env: { FOOTBALL_DATA_TOKEN: "t" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await refreshStandingsIfStale(db, { now: new Date(now.getTime() + 7 * 3_600_000), env: { FOOTBALL_DATA_TOKEN: "t" } });
    expect((await standingsForCompetition(db, "football:pl"))?.rows[0].team).toBe("Liverpool FC");
    const none = await createTestDb();
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    await refreshStandingsIfStale(none, { now, env: {} });
    expect(fn).not.toHaveBeenCalled();
    expect(await listStandings(none)).toEqual([]);
  });
});
