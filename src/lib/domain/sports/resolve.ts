import type { Sport } from "./entities";
import type { SportsIntent } from "./intent";

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "unknown";
export type StatusSource = "provider" | "schedule_only" | "creator";
/**
 * Verified stage. Mapping to the spec's provider statuses:
 * upcoming = upcoming, live = in_progress, completed = completed, postponed, cancelled, unknown.
 */
export type MatchStage = "upcoming" | "live" | "completed" | "postponed" | "cancelled" | "unknown";

export interface MatchRecord {
  id: string;
  provider: string;
  sport: Sport;
  competition: string;
  competitionId?: string | null;
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

/** Freshness policy per data type. */
export const LIVE_STATUS_MAX_AGE_MIN = 20;
/** A "scheduled" status older than this may hide a postponement or a result. */
export const SCHEDULED_STATUS_MAX_AGE_H = 48;
/** Rough match length, used only to know when a scheduled post would land after the match. */
export const EXPECTED_DURATION_H: Record<Sport, number> = { cricket: 4, football: 2 };

/**
 * Verified stage of a match. Never "live" from the clock alone: that needs a
 * fresh provider status. Stale scheduled data becomes "unknown".
 */
export function matchStage(m: MatchRecord, now: Date): MatchStage {
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "postponed") return "postponed";
  if (m.status === "finished") return "completed";
  const ageMin = (now.getTime() - m.statusCheckedAt.getTime()) / 60_000;
  if (m.status === "live") return m.statusSource === "provider" && ageMin <= LIVE_STATUS_MAX_AGE_MIN ? "live" : "unknown";
  if (now.getTime() < m.startsAt.getTime()) {
    if (m.statusSource !== "creator" && ageMin > SCHEDULED_STATUS_MAX_AGE_H * 60) return "unknown";
    return "upcoming";
  }
  return "unknown";
}

/**
 * The stage the caption should be written for, given when it will be posted.
 * A post that lands after kick-off of a match that hasn't finished yet is written
 * neutrally: nobody knows the result at generation time.
 */
export function writingStage(m: MatchRecord, now: Date, publishAt: Date | null): MatchStage {
  const stage = matchStage(m, now);
  if (!publishAt || publishAt.getTime() <= now.getTime()) return stage;
  if ((stage === "upcoming" || stage === "live") && publishAt.getTime() >= m.startsAt.getTime()) return "unknown";
  return stage;
}

/** Calendar day of a date in a timezone, as YYYY-MM-DD. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shiftDay(day: string, days: number): string {
  const [y, m, dd] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10);
}

export type Resolution =
  | { kind: "single"; match: MatchRecord; confidence: number; reason: string }
  | { kind: "ambiguous"; candidates: MatchRecord[]; reason: string }
  | { kind: "none"; reason: string };

const DAY = 86_400_000;

/**
 * Picks the match a caption is about.
 * - Never auto-picks the nearest fixture: two that fit go to the creator to choose
 *   (an explicit "next match" / "last match" is the only nearest-pick).
 * - Historical highlights never attach to a current fixture.
 * - An unresolved ambiguous alias (e.g. "MI") always goes to the selector.
 */
export function resolveMatch(intent: SportsIntent, matches: MatchRecord[], now: Date, timeZone = "Asia/Kolkata"): Resolution {
  if (!intent.sport) return { kind: "none", reason: "not a sports caption" };
  if (intent.contentType === "historical_highlight") return { kind: "none", reason: "historical highlight — not about a current fixture" };

  const teamAmbiguity = intent.ambiguities.find((a) => a.kind === "team");
  if (intent.teamIds.length === 0 && !teamAmbiguity) return { kind: "none", reason: "no team named" };

  const hasTeam = (m: MatchRecord, id: string) => m.homeTeamId === id || m.awayTeamId === id;
  let pool = matches.filter(
    (m) =>
      m.sport === intent.sport &&
      m.gender === intent.gender &&
      intent.teamIds.every((id) => hasTeam(m, id)) &&
      (!teamAmbiguity || teamAmbiguity.candidates.some((c) => hasTeam(m, c))),
  );
  if (intent.competitionId) {
    const sameComp = pool.filter((m) => !m.competitionId || m.competitionId === intent.competitionId);
    if (sameComp.length) pool = sameComp;
  }
  if (pool.length === 0) return { kind: "none", reason: "no stored fixture for these teams" };

  const today = localDay(now, timeZone);
  const dayOf = (m: MatchRecord) => localDay(m.startsAt, timeZone);
  const started = (m: MatchRecord) => m.startsAt.getTime() <= now.getTime();
  const onDays = (days: string[]) => pool.filter((m) => days.includes(dayOf(m)));
  let nearestPick = false;

  switch (intent.timeRef) {
    case "today":
      pool = onDays([today]);
      break;
    case "yesterday":
      pool = onDays([shiftDay(today, -1)]);
      break;
    case "tomorrow":
      pool = onDays([shiftDay(today, 1)]);
      break;
    case "kal_ambiguous":
      pool = onDays([shiftDay(today, -1), shiftDay(today, 1)]);
      break;
    case "day_before_yesterday":
      pool = onDays([shiftDay(today, -2)]);
      break;
    case "day_after_tomorrow":
      pool = onDays([shiftDay(today, 2)]);
      break;
    case "parso_ambiguous":
      pool = onDays([shiftDay(today, -2), shiftDay(today, 2)]);
      break;
    case "explicit_date":
      pool = intent.explicitDate ? onDays([intent.explicitDate]) : [];
      break;
    case "last_match":
      pool = pool.filter(started).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).slice(0, 1);
      nearestPick = true;
      break;
    case "next_match":
      pool = pool.filter((m) => !started(m)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 1);
      nearestPick = true;
      break;
    default: {
      const forward = ["preview", "prediction"].includes(intent.contentType) || intent.tense === "future";
      const backward = ["reaction", "analysis", "recap"].includes(intent.contentType) || intent.tense === "past";
      const recent = pool.filter((m) => started(m) && now.getTime() - m.startsAt.getTime() <= 3 * DAY);
      const soon = pool.filter((m) => !started(m) && m.startsAt.getTime() - now.getTime() <= 7 * DAY);
      pool = forward && !backward ? soon : backward && !forward ? recent : [...recent, ...soon];
    }
  }
  // Direction must still fit the video: a recap/reaction never attaches to a match that hasn't started.
  if (["recap", "reaction", "analysis"].includes(intent.contentType)) pool = pool.filter(started);
  if (["preview", "prediction"].includes(intent.contentType) && intent.timeRef !== "last_match") pool = pool.filter((m) => !started(m) || m.status === "live");

  pool = pool.sort((a, b) => Math.abs(a.startsAt.getTime() - now.getTime()) - Math.abs(b.startsAt.getTime() - now.getTime())).slice(0, 4);
  if (pool.length === 0) return { kind: "none", reason: "no fixture fits the time reference and video type" };
  if (teamAmbiguity) return { kind: "ambiguous", candidates: pool, reason: `"${teamAmbiguity.alias}" can mean more than one team` };
  if (pool.length === 1) {
    const confidence = Math.min(0.95, 0.5 + intent.confidence.teams * 0.3 + (intent.timeRef ? 0.15 : 0.05) + (nearestPick ? 0 : 0.05));
    return { kind: "single", match: pool[0], confidence, reason: `teams + ${intent.timeRef ?? intent.contentType}` };
  }
  return { kind: "ambiguous", candidates: pool, reason: "more than one fixture fits" };
}

/** How the caption should behave at each verified stage (given to the model as a rule). */
export const STAGE_GUIDANCE: Record<MatchStage, string> = {
  upcoming: "Match has NOT started. Write a preview: expectations, a relevant question. Never state or imply a result or score.",
  live: "Match is live per a fresh provider status. React to verified facts only; do not invent scores or moments.",
  completed: "Match is over. Use only the confirmed result given here; do not add scores, records or moments not listed.",
  postponed: "Match is postponed. Mention the update; do not write it as being played.",
  cancelled: "Match is cancelled. Mention the update; do not write it as being played.",
  unknown: "Current match status is unknown or stale, or the post goes out after kick-off. Use neutral wording: no live, result or score claims, and no 'aaj ka match' timing claims.",
};
