import type { Sport } from "./entities";
import type { SportsIntent } from "./intent";

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "unknown";
export type StatusSource = "provider" | "schedule_only" | "creator";
export type MatchStage = "upcoming" | "live" | "completed" | "postponed" | "cancelled" | "unknown";

export interface MatchRecord {
  id: string;
  provider: string;
  sport: Sport;
  competition: string;
  gender: "men" | "women";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  startsAt: Date;
  status: MatchStatus;
  statusSource: StatusSource;
  statusCheckedAt: Date;
  resultSummary: string | null;
  url: string | null;
}

/** A provider "live" status older than this is not trusted as live any more. */
export const LIVE_STATUS_MAX_AGE_MIN = 20;

/**
 * Verified stage of a match. A match is never assumed to be live just because the
 * start time has passed: without a fresh provider status it is "unknown".
 */
export function matchStage(m: MatchRecord, now: Date): MatchStage {
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "postponed") return "postponed";
  if (m.status === "finished") return "completed";
  const ageMin = (now.getTime() - m.statusCheckedAt.getTime()) / 60_000;
  if (m.status === "live") return m.statusSource === "provider" && ageMin <= LIVE_STATUS_MAX_AGE_MIN ? "live" : "unknown";
  if (now.getTime() < m.startsAt.getTime()) return "upcoming";
  return "unknown";
}

/** Calendar day of a date in a timezone, as YYYY-MM-DD. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shiftDay(day: string, days: number): string {
  const [y, m, dd] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + days));
  return t.toISOString().slice(0, 10);
}

export type Resolution =
  | { kind: "single"; match: MatchRecord; reason: string }
  | { kind: "ambiguous"; candidates: MatchRecord[]; reason: string }
  | { kind: "none"; reason: string };

/**
 * Picks the match a caption is about. Team names alone are never enough when
 * more than one fixture fits: preview vs recap intent and the time reference
 * decide, and anything still unclear goes back to the creator to confirm.
 */
export function resolveMatch(intent: SportsIntent, matches: MatchRecord[], now: Date, timeZone = "Asia/Kolkata"): Resolution {
  if (!intent.sport) return { kind: "none", reason: "not a sports caption" };
  if (intent.teamIds.length === 0) return { kind: "none", reason: "no team named" };

  let pool = matches.filter(
    (m) =>
      m.sport === intent.sport &&
      m.gender === intent.gender &&
      intent.teamIds.every((id) => m.homeTeamId === id || m.awayTeamId === id),
  );
  if (pool.length === 0) return { kind: "none", reason: "no stored fixture for these teams" };

  const today = localDay(now, timeZone);
  const dayOf = (m: MatchRecord) => localDay(m.startsAt, timeZone);
  const past = (m: MatchRecord) => m.startsAt.getTime() <= now.getTime();
  const byCloseness = (a: MatchRecord, b: MatchRecord) => Math.abs(a.startsAt.getTime() - now.getTime()) - Math.abs(b.startsAt.getTime() - now.getTime());

  switch (intent.timeRef) {
    case "today":
      pool = pool.filter((m) => dayOf(m) === today);
      break;
    case "yesterday":
      pool = pool.filter((m) => dayOf(m) === shiftDay(today, -1));
      break;
    case "tomorrow":
      pool = pool.filter((m) => dayOf(m) === shiftDay(today, 1));
      break;
    case "kal_ambiguous":
      pool = pool.filter((m) => dayOf(m) === shiftDay(today, -1) || dayOf(m) === shiftDay(today, 1));
      break;
    case "last_match": {
      const p = pool.filter(past).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
      pool = p.slice(0, 1);
      break;
    }
    case "next_match": {
      const f = pool.filter((m) => !past(m)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      pool = f.slice(0, 1);
      break;
    }
    default: {
      // No time words: the kind of video decides direction.
      const forward = intent.contentType === "preview" || intent.contentType === "prediction" || intent.tense === "future";
      const backward = ["reaction", "analysis", "highlights"].includes(intent.contentType) || intent.tense === "past";
      const recent = pool.filter((m) => past(m) && now.getTime() - m.startsAt.getTime() <= 3 * 86_400_000);
      const soon = pool.filter((m) => !past(m) && m.startsAt.getTime() - now.getTime() <= 7 * 86_400_000);
      if (forward && !backward) pool = soon.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 1);
      else if (backward && !forward) pool = recent.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).slice(0, 1);
      else pool = [...recent.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).slice(0, 1), ...soon.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 1)];
    }
  }

  pool = pool.sort(byCloseness).slice(0, 4);
  if (pool.length === 1) return { kind: "single", match: pool[0], reason: `teams + ${intent.timeRef ?? intent.contentType}` };
  if (pool.length === 0) return { kind: "none", reason: "no fixture fits the time reference" };
  return { kind: "ambiguous", candidates: pool, reason: "more than one fixture fits" };
}

/** How the caption should behave at each verified stage (given to the model as a rule). */
export const STAGE_GUIDANCE: Record<MatchStage, string> = {
  upcoming: "Match has NOT started. Write a preview: expectations, a relevant question. Never state or imply a result or score.",
  live: "Match is live per a fresh provider status. React to verified facts only; do not invent scores or moments.",
  completed: "Match is over. Use only the confirmed result given here; do not add scores, records or moments not listed.",
  postponed: "Match is postponed. Mention the update; do not write it as being played.",
  cancelled: "Match is cancelled. Mention the update; do not write it as being played.",
  unknown: "Current match status is unknown or stale. Use neutral wording: no live, result or score claims, and no 'aaj ka match' timing claims.",
};
