import { z } from "zod";
import { TEAM_BY_ID, teamIdForName } from "@/lib/domain/sports/entities";
import type { MatchStatus } from "@/lib/domain/sports/resolve";
import type { MatchUpsert } from "@/lib/repo/sports";
import { RateLimitedError, SourceFetchError, retryAfterSeconds } from "@/lib/providers/trends/types";

export { RateLimitedError };
import type { Sport } from "@/lib/domain/sports/entities";

/**
 * Common adapter for fixture/status providers. Output is normalized into the
 * canonical match model (MatchUpsert). Keys stay server-side; a provider without
 * its key is never built (it shows "requires configuration").
 */
export interface MatchProvider {
  key: string;
  sport: Sport;
  /** Free-tier budget we hold ourselves to (below the provider's own limit). */
  budget: { perDay: number; perMinute: number };
  /** Minutes between fixture-list refreshes, normally and while one of its matches is in play. */
  intervals: { fixturesMin: number; liveMin: number };
  /** HTTP calls one listFixtures() makes. */
  callsPerList: number;
  /** True when the provider reports live status itself (vs schedule-only data). */
  reportsLiveStatus: boolean;
  listFixtures(range: { from: Date; to: Date }, signal: AbortSignal, now: Date): Promise<MatchUpsert[]>;
  /** One match by provider id; null when not found (or not supported). */
  getMatch(providerId: string, signal: AbortSignal, now: Date): Promise<MatchUpsert | null>;
}

/** Daily call budgets we hold each fixtures provider to (also shown in admin diagnostics). */
export const PROVIDER_DAILY_BUDGET: Record<string, number> = { openligadb: 120, openfootball_fixtures: 40, football_data: 150, cricapi: 90 };

/** JSON GET with clear empty-vs-error semantics: 404 → null (empty), 429 → RateLimitedError, other errors throw. */
export async function getJson(url: string, init: { signal: AbortSignal; headers?: Record<string, string> }): Promise<unknown> {
  const res = await fetch(url, { ...init, credentials: "omit", redirect: "follow" });
  if (res.status === 404) return null;
  if (res.status === 429) throw new RateLimitedError(retryAfterSeconds(res));
  if (res.status >= 500) throw new SourceFetchError(`HTTP ${res.status}`, true);
  if (!res.ok) throw new SourceFetchError(`HTTP ${res.status}`, false);
  return res.json();
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

const inRange = (d: Date, r: { from: Date; to: Date }) => d.getTime() >= r.from.getTime() && d.getTime() <= r.to.getTime();

export function footballSeason(now: Date): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1; // seasons start in July/August
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

// ---------- OpenLigaDB (keyless community data, ODbL) ----------

const OpenLigaMatch = z.object({
  matchID: z.number(),
  matchDateTimeUTC: z.string(),
  matchIsFinished: z.boolean(),
  leagueName: z.string().optional(),
  leagueShortcut: z.string().optional(),
  team1: z.object({ teamName: z.string() }),
  team2: z.object({ teamName: z.string() }),
  matchResults: z.array(z.object({ resultTypeID: z.number(), pointsTeam1: z.number().nullable(), pointsTeam2: z.number().nullable() })).default([]),
  location: z.object({ locationCity: z.string().nullable().optional(), locationStadium: z.string().nullable().optional() }).nullable().optional(),
});

const OPENLIGA_LEAGUES = [
  { shortcut: "pl", competitionId: "football:pl", name: "Premier League" },
  { shortcut: "la1", competitionId: "football:laliga", name: "LaLiga" },
  { shortcut: "ucl", competitionId: "football:ucl", name: "UEFA Champions League" },
  { shortcut: "bl1", competitionId: "football:bundesliga", name: "Bundesliga" },
];

function openLigaToUpsert(m: z.infer<typeof OpenLigaMatch>, league: (typeof OPENLIGA_LEAGUES)[number] | undefined, season: string, now: Date): MatchUpsert {
  const final = m.matchResults.find((r) => r.resultTypeID === 2);
  const finished = m.matchIsFinished && final && final.pointsTeam1 !== null && final.pointsTeam2 !== null;
  const venue = [m.location?.locationStadium, m.location?.locationCity].filter(Boolean).join(", ") || null;
  return {
    provider: "openligadb",
    externalId: String(m.matchID),
    sport: "football",
    competition: league?.name ?? m.leagueName ?? "Football",
    competitionId: league?.competitionId ?? null,
    season,
    gender: "men",
    homeTeamId: teamIdForName(m.team1.teamName, "football"),
    awayTeamId: teamIdForName(m.team2.teamName, "football"),
    homeName: m.team1.teamName,
    awayName: m.team2.teamName,
    startsAt: new Date(m.matchDateTimeUTC),
    // Community data: a result counts only once marked finished; never treated as live.
    status: finished ? "finished" : "scheduled",
    statusSource: "schedule_only",
    statusCheckedAt: now,
    resultSummary: finished ? `${m.team1.teamName} ${final!.pointsTeam1}–${final!.pointsTeam2} ${m.team2.teamName} (full time, community data)` : null,
    url: `https://www.openligadb.de/`,
    venue,
    verified: false,
  };
}

/**
 * api.openligadb.de — free, no key, community-maintained (ODbL). Covers Premier
 * League, LaLiga, Champions League and Bundesliga for the current season. Results
 * can lag (verified live 2026-10-20: UCL results within ~30 min, PL/LaLiga days late).
 */
export class OpenLigaDbProvider implements MatchProvider {
  key = "openligadb";
  sport = "football" as const;
  budget = { perDay: 120, perMinute: 10 };
  intervals = { fixturesMin: 120, liveMin: 15 };
  callsPerList = OPENLIGA_LEAGUES.length;
  reportsLiveStatus = false;
  constructor(private userAgent: string) {}

  async listFixtures(range: { from: Date; to: Date }, signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const seasonYear = footballSeason(now).slice(0, 4);
    const out: MatchUpsert[] = [];
    for (const league of OPENLIGA_LEAGUES) {
      const json = await getJson(`https://api.openligadb.de/getmatchdata/${league.shortcut}/${seasonYear}`, { signal, headers: { "User-Agent": this.userAgent, Accept: "application/json" } });
      if (!Array.isArray(json)) continue;
      for (const raw of json) {
        const one = OpenLigaMatch.safeParse(raw);
        if (!one.success) continue;
        const u = openLigaToUpsert(one.data, league, footballSeason(now), now);
        if (inRange(u.startsAt, range)) out.push(u);
      }
    }
    return out;
  }

  async getMatch(providerId: string, signal: AbortSignal, now: Date): Promise<MatchUpsert | null> {
    const json = await getJson(`https://api.openligadb.de/getmatchdata/${encodeURIComponent(providerId)}`, { signal, headers: { "User-Agent": this.userAgent } });
    const one = OpenLigaMatch.safeParse(json);
    if (!one.success) return null;
    return openLigaToUpsert(one.data, OPENLIGA_LEAGUES.find((l) => l.shortcut === one.data.leagueShortcut), footballSeason(now), now);
  }
}

// ---------- openfootball (keyless, public domain; schedule backup) ----------

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
  { code: "en.1", tz: "Europe/London", competitionId: "football:pl" },
  { code: "es.1", tz: "Europe/Madrid", competitionId: "football:laliga" },
  { code: "de.1", tz: "Europe/Berlin", competitionId: "football:bundesliga" },
  { code: "it.1", tz: "Europe/Rome", competitionId: "football:seriea" },
  { code: "fr.1", tz: "Europe/Paris", competitionId: "football:ligue1" },
];

/**
 * Fixture lists from github.com/openfootball (CC0). Schedules only: there is no
 * live status, and results appear when volunteers update the files.
 */
export class OpenFootballProvider implements MatchProvider {
  key = "openfootball_fixtures";
  sport = "football" as const;
  budget = { perDay: 40, perMinute: 10 };
  intervals = { fixturesMin: 360, liveMin: 360 };
  callsPerList = OPENFOOTBALL_LEAGUES.length;
  reportsLiveStatus = false;
  constructor(private userAgent: string) {}

  async listFixtures(range: { from: Date; to: Date }, signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const season = footballSeason(now);
    const out: MatchUpsert[] = [];
    for (const league of OPENFOOTBALL_LEAGUES) {
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${league.code}.json`;
      const json = await getJson(url, { signal, headers: { "User-Agent": this.userAgent, Accept: "application/json" } });
      if (json === null) continue;
      const parsed = OpenFootballSchema.safeParse(json);
      if (!parsed.success) throw new SourceFetchError(`Unexpected openfootball shape for ${league.code}`, false);
      for (const raw of parsed.data.matches) {
        // One odd row never drops the whole league.
        const one = OpenFootballMatch.safeParse(raw);
        if (!one.success) continue;
        const m = one.data;
        const startsAt = zonedToUtc(m.date, m.time ?? "", league.tz);
        if (!inRange(startsAt, range)) continue;
        const ft = Array.isArray(m.score) ? m.score : m.score?.ft;
        out.push({
          provider: "openfootball",
          externalId: `${league.code}:${season}:${m.date}:${m.team1}:${m.team2}`,
          sport: "football",
          competition: parsed.data.name,
          competitionId: league.competitionId,
          season,
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
          verified: false,
        });
      }
    }
    return out;
  }

  async getMatch(): Promise<MatchUpsert | null> {
    return null; // file-based source: only the full list exists
  }
}

// ---------- football-data.org (free token) ----------

const FootballDataMatch = z.object({
  id: z.number(),
  utcDate: z.string(),
  status: z.string(),
  venue: z.string().nullable().optional(),
  season: z.object({ startDate: z.string().optional() }).optional(),
  competition: z.object({ name: z.string(), code: z.string().optional() }),
  homeTeam: z.object({ name: z.string().nullable() }),
  awayTeam: z.object({ name: z.string().nullable() }),
  score: z.object({ fullTime: z.object({ home: z.number().nullable(), away: z.number().nullable() }) }).optional(),
});
const FootballDataSchema = z.object({ matches: z.array(FootballDataMatch) });

const FD_COMPETITIONS: Record<string, string> = {
  PL: "football:pl", PD: "football:laliga", CL: "football:ucl", BL1: "football:bundesliga", SA: "football:seriea", FL1: "football:ligue1", WC: "football:wc", EC: "football:euro",
};

export function footballDataStatus(s: string): MatchStatus {
  if (s === "SCHEDULED" || s === "TIMED") return "scheduled";
  if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return "live";
  if (s === "FINISHED" || s === "AWARDED") return "finished";
  if (s === "POSTPONED") return "postponed";
  if (s === "CANCELLED" || s === "SUSPENDED") return "cancelled";
  return "unknown";
}

function fdToUpsert(m: z.infer<typeof FootballDataMatch>, now: Date): MatchUpsert | null {
  if (!m.homeTeam.name || !m.awayTeam.name) return null;
  const status = footballDataStatus(m.status);
  const ft = m.score?.fullTime;
  const home = m.homeTeam.name;
  const away = m.awayTeam.name;
  return {
    provider: "football_data",
    externalId: String(m.id),
    sport: "football",
    competition: m.competition.name,
    competitionId: (m.competition.code && FD_COMPETITIONS[m.competition.code]) || null,
    season: m.season?.startDate?.slice(0, 4) ?? null,
    gender: "men",
    homeTeamId: teamIdForName(home, "football"),
    awayTeamId: teamIdForName(away, "football"),
    homeName: home,
    awayName: away,
    startsAt: new Date(m.utcDate),
    status,
    statusSource: "provider",
    statusCheckedAt: now,
    resultSummary: status === "finished" && ft && ft.home !== null && ft.away !== null ? `${home} ${ft.home}–${ft.away} ${away} (full time)` : null,
    url: null,
    venue: m.venue ?? null,
    verified: true,
  };
}

/** football-data.org v4 (free tier: 12 competitions, 10 calls/min, delayed scores). One call lists all competitions. */
export class FootballDataProvider implements MatchProvider {
  key = "football_data";
  sport = "football" as const;
  budget = { perDay: 150, perMinute: 6 };
  intervals = { fixturesMin: 30, liveMin: 10 };
  callsPerList = 1;
  reportsLiveStatus = true;
  constructor(private token: string) {}

  async listFixtures(range: { from: Date; to: Date }, signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    // The free tier allows at most 10 days per request.
    const to = new Date(Math.min(range.to.getTime(), range.from.getTime() + 9 * 86_400_000));
    const json = await getJson(`https://api.football-data.org/v4/matches?dateFrom=${day(range.from)}&dateTo=${day(to)}`, { signal, headers: { "X-Auth-Token": this.token, Accept: "application/json" } });
    if (json === null) return [];
    const parsed = FootballDataSchema.safeParse(json);
    if (!parsed.success) throw new SourceFetchError("Unexpected football-data.org shape", false);
    return parsed.data.matches.map((m) => fdToUpsert(m, now)).filter((m): m is MatchUpsert => m !== null);
  }

  async getMatch(providerId: string, signal: AbortSignal, now: Date): Promise<MatchUpsert | null> {
    const json = await getJson(`https://api.football-data.org/v4/matches/${encodeURIComponent(providerId)}`, { signal, headers: { "X-Auth-Token": this.token } });
    const one = FootballDataMatch.safeParse(json);
    return one.success ? fdToUpsert(one.data, now) : null;
  }
}

// ---------- CricAPI / CricketData.org (free key, 100 hits/day) ----------

const CricMatch = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  venue: z.string().optional(),
  dateTimeGMT: z.string(),
  teams: z.array(z.string()).min(2),
  matchStarted: z.boolean().optional(),
  matchEnded: z.boolean().optional(),
  series: z.string().optional(),
  series_id: z.string().optional(),
});
const CricApiSchema = z.object({ status: z.string(), data: z.array(CricMatch).default([]) });

export function cricApiStatus(m: { matchStarted?: boolean; matchEnded?: boolean; status?: string }): MatchStatus {
  const s = (m.status ?? "").toLowerCase();
  if (/abandon|cancel|no result/.test(s)) return "cancelled";
  if (/postpone/.test(s)) return "postponed";
  if (m.matchEnded) return "finished";
  if (m.matchStarted) return "live";
  return "scheduled";
}

function cricCompetition(name: string, women: boolean, kinds: (string | undefined)[]): string | null {
  if (/women'?s premier league|\bwpl\b/i.test(name)) return "cricket:wpl";
  if (/indian premier league|\bipl\b/i.test(name)) return "cricket:ipl";
  if (/\bsa20\b/i.test(name)) return "cricket:sa20";
  if (/ilt20|international league t20/i.test(name)) return "cricket:ilt20";
  if (/major league cricket/i.test(name)) return "cricket:mlc";
  if (kinds.every((k) => k === "national")) return women ? "cricket:intl_w" : "cricket:intl";
  return null;
}

function cricToUpsert(m: z.infer<typeof CricMatch>, now: Date): MatchUpsert | null {
  const teamKind = (id: string | null) => (id ? TEAM_BY_ID.get(id)?.kind : undefined);
  const startsAt = new Date(m.dateTimeGMT.endsWith("Z") ? m.dateTimeGMT : `${m.dateTimeGMT}Z`);
  if (Number.isNaN(startsAt.getTime())) return null;
  const status = cricApiStatus(m);
  const [home, away] = m.teams;
  const women = /women/i.test(m.name) || m.teams.some((t) => /women/i.test(t));
  const named = (t: string) => (women && !/women/i.test(t) ? `${t} Women` : t);
  const homeTeamId = teamIdForName(named(home), "cricket");
  const awayTeamId = teamIdForName(named(away), "cricket");
  return {
    provider: "cricapi",
    externalId: m.id,
    sport: "cricket",
    competition: m.series ?? m.name,
    competitionId: cricCompetition(`${m.series ?? ""} ${m.name}`, women, [teamKind(homeTeamId), teamKind(awayTeamId)]),
    gender: women ? "women" : "men",
    homeTeamId,
    awayTeamId,
    homeName: home,
    awayName: away,
    startsAt,
    status,
    statusSource: "provider",
    statusCheckedAt: now,
    resultSummary: status === "finished" && m.status ? m.status : null,
    url: null,
    venue: m.venue ?? null,
    verified: true,
  };
}

/** CricAPI v1 currentMatches + matches. Data is "a few minutes behind real-time" (cricketdata.org/pricing, 2026-10-20). */
export class CricApiProvider implements MatchProvider {
  key = "cricapi";
  sport = "cricket" as const;
  budget = { perDay: 90, perMinute: 5 };
  intervals = { fixturesMin: 180, liveMin: 10 };
  callsPerList = 2;
  reportsLiveStatus = true;
  constructor(private apiKey: string) {}

  async listFixtures(range: { from: Date; to: Date }, signal: AbortSignal, now: Date): Promise<MatchUpsert[]> {
    const out = new Map<string, MatchUpsert>();
    for (const path of ["currentMatches", "matches"]) {
      const json = await getJson(`https://api.cricapi.com/v1/${path}?apikey=${encodeURIComponent(this.apiKey)}&offset=0`, { signal, headers: { Accept: "application/json" } });
      if (json === null) continue;
      const parsed = CricApiSchema.safeParse(json);
      if (!parsed.success || parsed.data.status !== "success") throw new SourceFetchError("CricAPI returned an error or unexpected shape", false);
      for (const m of parsed.data.data) {
        const u = cricToUpsert(m, now);
        if (u && inRange(u.startsAt, range)) out.set(m.id, u);
      }
    }
    return [...out.values()];
  }

  async getMatch(providerId: string, signal: AbortSignal, now: Date): Promise<MatchUpsert | null> {
    const json = await getJson(`https://api.cricapi.com/v1/match_info?apikey=${encodeURIComponent(this.apiKey)}&id=${encodeURIComponent(providerId)}`, { signal, headers: { Accept: "application/json" } });
    const parsed = z.object({ status: z.string(), data: CricMatch }).safeParse(json);
    return parsed.success && parsed.data.status === "success" ? cricToUpsert(parsed.data.data, now) : null;
  }
}
