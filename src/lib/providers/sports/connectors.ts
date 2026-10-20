import { z } from "zod";
import { teamIdForName } from "@/lib/domain/sports/entities";
import type { MatchStatus } from "@/lib/domain/sports/resolve";
import type { MatchUpsert } from "@/lib/repo/sports";
import { fetchJson, SourceFetchError } from "@/lib/providers/trends/types";

export interface SportsConnector {
  key: string;
  /** Minimum minutes between runs. */
  minIntervalMinutes: number;
  /** Hard cap on HTTP calls per UTC day (free-tier budgets). */
  dailyCallCap: number;
  /** HTTP calls one run makes, for the cap. */
  callsPerRun: number;
  fetch(signal: AbortSignal, now: Date): Promise<MatchUpsert[]>;
}

/** Converts a wall-clock time in a timezone to UTC (handles DST via Intl). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "12:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asLocal - guess));
}

const inWindow = (d: Date, now: Date) => d.getTime() >= now.getTime() - 10 * 86_400_000 && d.getTime() <= now.getTime() + 14 * 86_400_000;

// ---------- openfootball (keyless, public domain) ----------

const OpenFootballMatch = z.object({
  round: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().optional(),
  team1: z.string(),
  team2: z.string(),
  // Either {"ft": [h, a], "ht": [...]} or a bare [h, a] full-time score.
  score: z.union([z.object({ ft: z.array(z.number()).length(2).optional() }), z.array(z.number()).length(2)]).optional(),
});
const OpenFootballSchema = z.object({ name: z.string(), matches: z.array(z.unknown()) });

const OPENFOOTBALL_LEAGUES = [
  { code: "en.1", tz: "Europe/London" },
  { code: "es.1", tz: "Europe/Madrid" },
  { code: "de.1", tz: "Europe/Berlin" },
  { code: "it.1", tz: "Europe/Rome" },
  { code: "fr.1", tz: "Europe/Paris" },
];

export function footballSeason(now: Date): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1; // seasons start in July/August
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Fixture lists from github.com/openfootball (CC0). Schedules only: there is no
 * live status, and results appear when volunteers update the files, so a started
 * match without a score stays "unknown" — never "live".
 */
export class OpenFootballConnector implements SportsConnector {
  key = "openfootball_fixtures";
  minIntervalMinutes = 360;
  dailyCallCap = 40;
  callsPerRun = OPENFOOTBALL_LEAGUES.length;
  constructor(private userAgent: string) {}

  async fetch(signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const season = footballSeason(now);
    const out: MatchUpsert[] = [];
    for (const league of OPENFOOTBALL_LEAGUES) {
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${league.code}.json`;
      const json = await fetchJson(url, { signal, credentials: "omit", headers: { "User-Agent": this.userAgent, Accept: "application/json" } });
      if (json === null) continue;
      const parsed = OpenFootballSchema.safeParse(json);
      if (!parsed.success) throw new SourceFetchError(`Unexpected openfootball shape for ${league.code}`, false);
      for (const raw of parsed.data.matches) {
        // One odd row never drops the whole league.
        const one = OpenFootballMatch.safeParse(raw);
        if (!one.success) continue;
        const m = one.data;
        const startsAt = zonedToUtc(m.date, m.time ?? "", league.tz);
        if (!inWindow(startsAt, now)) continue;
        const ft = Array.isArray(m.score) ? m.score : m.score?.ft;
        out.push({
          provider: "openfootball",
          externalId: `${league.code}:${season}:${m.date}:${m.team1}:${m.team2}`,
          sport: "football",
          competition: parsed.data.name,
          gender: "men",
          homeTeamId: teamIdForName(m.team1, "football"),
          awayTeamId: teamIdForName(m.team2, "football"),
          homeName: m.team1,
          awayName: m.team2,
          startsAt,
          status: ft ? "finished" : "scheduled",
          statusSource: "schedule_only",
          statusCheckedAt: now,
          resultSummary: ft ? `${m.team1} ${ft[0]}–${ft[1]} ${m.team2} (full time)` : null,
          url: `https://github.com/openfootball/football.json/blob/master/${season}/${league.code}.json`,
        });
      }
    }
    return out;
  }
}

// ---------- football-data.org (free token) ----------

const FootballDataSchema = z.object({
  matches: z.array(
    z.object({
      id: z.number(),
      utcDate: z.string(),
      status: z.string(),
      competition: z.object({ name: z.string() }),
      homeTeam: z.object({ name: z.string().nullable() }),
      awayTeam: z.object({ name: z.string().nullable() }),
      score: z.object({ fullTime: z.object({ home: z.number().nullable(), away: z.number().nullable() }) }).optional(),
    }),
  ),
});

export function footballDataStatus(s: string): MatchStatus {
  if (s === "SCHEDULED" || s === "TIMED") return "scheduled";
  if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return "live";
  if (s === "FINISHED" || s === "AWARDED") return "finished";
  if (s === "POSTPONED") return "postponed";
  if (s === "CANCELLED" || s === "SUSPENDED") return "cancelled";
  return "unknown";
}

/** football-data.org v4 (free tier: 12 competitions, 10 calls/min). One call covers all competitions. */
export class FootballDataConnector implements SportsConnector {
  key = "football_data";
  minIntervalMinutes = 30;
  dailyCallCap = 150;
  callsPerRun = 1;
  constructor(private token: string) {}

  async fetch(signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const json = await fetchJson(`https://api.football-data.org/v4/matches?dateFrom=${day(-3)}&dateTo=${day(6)}`, {
      signal,
      credentials: "omit",
      headers: { "X-Auth-Token": this.token, Accept: "application/json" },
    });
    if (json === null) return [];
    const parsed = FootballDataSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected football-data.org shape", false);
    return parsed.data.matches
      .filter((m) => m.homeTeam.name && m.awayTeam.name)
      .map((m) => {
        const status = footballDataStatus(m.status);
        const ft = m.score?.fullTime;
        const home = m.homeTeam.name!;
        const away = m.awayTeam.name!;
        return {
          provider: "football_data",
          externalId: String(m.id),
          sport: "football" as const,
          competition: m.competition.name,
          gender: "men" as const,
          homeTeamId: teamIdForName(home, "football"),
          awayTeamId: teamIdForName(away, "football"),
          homeName: home,
          awayName: away,
          startsAt: new Date(m.utcDate),
          status,
          statusSource: "provider" as const,
          statusCheckedAt: now,
          resultSummary: status === "finished" && ft && ft.home !== null && ft.away !== null ? `${home} ${ft.home}–${ft.away} ${away} (full time)` : null,
          url: null,
        };
      });
  }
}

// ---------- CricAPI / CricketData.org (free key, 100 hits/day) ----------

const CricApiSchema = z.object({
  status: z.string(),
  data: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string().optional(),
        dateTimeGMT: z.string(),
        teams: z.array(z.string()).min(2),
        matchStarted: z.boolean().optional(),
        matchEnded: z.boolean().optional(),
        series: z.string().optional(),
      }),
    )
    .default([]),
});

export function cricApiStatus(m: { matchStarted?: boolean; matchEnded?: boolean; status?: string }): MatchStatus {
  const s = (m.status ?? "").toLowerCase();
  if (/abandon|cancel|no result/.test(s)) return "cancelled";
  if (/postpone/.test(s)) return "postponed";
  if (m.matchEnded) return "finished";
  if (m.matchStarted) return "live";
  return "scheduled";
}

/** CricAPI v1 currentMatches + matches. Data can lag real time; status text is kept as provided. */
export class CricApiConnector implements SportsConnector {
  key = "cricapi";
  minIntervalMinutes = 60;
  dailyCallCap = 90;
  callsPerRun = 2;
  constructor(private apiKey: string) {}

  async fetch(signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const out = new Map<string, MatchUpsert>();
    for (const path of ["currentMatches", "matches"]) {
      const json = await fetchJson(`https://api.cricapi.com/v1/${path}?apikey=${encodeURIComponent(this.apiKey)}&offset=0`, {
        signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (json === null) continue;
      const parsed = CricApiSchema.safeParse(json);
      if (!parsed.success || parsed.data.status !== "success") throw new SourceFetchError("CricAPI returned an error or unexpected shape", false);
      for (const m of parsed.data.data) {
        const startsAt = new Date(m.dateTimeGMT.endsWith("Z") ? m.dateTimeGMT : `${m.dateTimeGMT}Z`);
        if (Number.isNaN(startsAt.getTime()) || !inWindow(startsAt, now)) continue;
        const status = cricApiStatus(m);
        const [home, away] = m.teams;
        const women = /women/i.test(m.name) || m.teams.some((t) => /women/i.test(t));
        const clean = (t: string) => t.replace(/\s*women$/i, "").trim();
        out.set(m.id, {
          provider: "cricapi",
          externalId: m.id,
          sport: "cricket",
          competition: m.series ?? m.name,
          gender: women ? "women" : "men",
          homeTeamId: teamIdForName(clean(home), "cricket"),
          awayTeamId: teamIdForName(clean(away), "cricket"),
          homeName: home,
          awayName: away,
          startsAt,
          status,
          statusSource: "provider",
          statusCheckedAt: now,
          resultSummary: status === "finished" && m.status ? m.status : null,
          url: null,
        });
      }
    }
    return [...out.values()];
  }
}
