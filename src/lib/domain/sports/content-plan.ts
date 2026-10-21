import type { Sport } from "./entities";
import { EXPECTED_DURATION_H, type MatchStage } from "./resolve";

/**
 * A match-day posting plan: the moments sports creators usually post at, timed from the
 * fixture's kick-off. Facts are never part of the plan — each step only says what kind of
 * post fits that moment; result steps wait for a confirmed result.
 */
export type PlanStepKey = "preview" | "matchday" | "lineups" | "live" | "fulltime" | "analysis";

export interface PlanStep {
  key: PlanStepKey;
  at: Date;
  /** The step that fits right now. */
  current: boolean;
  /** Its moment has passed. */
  past: boolean;
}

const H = 3_600_000;

export function contentPlan(m: { sport: Sport; startsAt: Date; stage: MatchStage }, now: Date): PlanStep[] {
  const start = m.startsAt.getTime();
  const end = start + EXPECTED_DURATION_H[m.sport] * H;
  const steps: { key: PlanStepKey; at: number }[] = [
    { key: "preview", at: start - 24 * H },
    { key: "matchday", at: start - 4 * H },
    // Football line-ups come about an hour before kick-off; the cricket toss about 30 minutes before.
    { key: "lineups", at: start - (m.sport === "cricket" ? 0.5 : 1) * H },
    { key: "live", at: start },
    { key: "fulltime", at: end },
    { key: "analysis", at: end + 12 * H },
  ];
  const t = now.getTime();
  // Result steps only become "current" once the result is confirmed.
  const resultKnown = m.stage === "completed";
  let current: PlanStepKey | null = null;
  for (const s of steps) {
    if (s.at > t) break;
    if ((s.key === "fulltime" || s.key === "analysis") && !resultKnown) break;
    current = s.key;
  }
  if (m.stage === "postponed" || m.stage === "cancelled") current = null;
  return steps.map((s) => ({ key: s.key, at: new Date(s.at), current: s.key === current, past: s.at <= t && s.key !== current }));
}

/** An iCalendar event for the fixture (no times invented: start is the provider's, end the usual duration). */
export function fixtureIcs(m: { id: string; sport: Sport; homeName: string; awayName: string; competition: string; startsAt: Date; source: string }, now: Date): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const end = new Date(m.startsAt.getTime() + EXPECTED_DURATION_H[m.sport] * H);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TrendSaathi//Match calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${m.id}@trendsaathi`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(m.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${m.homeName} vs ${m.awayName}`)}`,
    `DESCRIPTION:${esc(`${m.competition}. Kick-off time from ${m.source}; check before posting.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`Post your ${m.homeName} vs ${m.awayName} preview`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Hashtags that follow only from the fixture itself (team codes, names, competition, sport). */
export function fixtureHashtags(m: { sport: Sport; homeShort?: string | null; awayShort?: string | null; homeName: string; awayName: string; competitionTag?: string | null }): string[] {
  const pascal = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !/^(fc|afc|cf|sc|ssc|club)$/i.test(w))
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  const tags = [
    m.homeShort && m.awayShort ? `#${m.homeShort}vs${m.awayShort}` : `#${pascal(m.homeName)}vs${pascal(m.awayName)}`,
    `#${pascal(m.homeName)}`,
    `#${pascal(m.awayName)}`,
    m.competitionTag ? `#${m.competitionTag}` : null,
    m.sport === "cricket" ? "#Cricket" : "#Football",
  ];
  return [...new Set(tags.filter((t): t is string => Boolean(t) && t!.length > 2 && t!.length <= 40))];
}
