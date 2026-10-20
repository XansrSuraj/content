import "server-only";
import type { DB } from "@/lib/db/client";
import type { MatchSnapshot, SportsContextUsed } from "@/lib/db/schema";
import { TEAM_BY_ID, PLAYERS } from "@/lib/domain/sports/entities";
import { parseSportsIntent, type SportsIntent } from "@/lib/domain/sports/intent";
import { matchStage, resolveMatch, STAGE_GUIDANCE, writingStage, type MatchRecord, type MatchStage } from "@/lib/domain/sports/resolve";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { getMatch, listMatchesFor } from "@/lib/repo/sports";

const PROVIDER_LABEL: Record<string, string> = {
  openfootball: "openfootball fixture list (schedule only, no live status)",
  openligadb: "OpenLigaDB community data (no live status; results can lag)",
  football_data: "football-data.org",
  cricapi: "CricketData.org (CricAPI)",
  creator: "the creator (not independently verified)",
};

export function snapshot(m: MatchRecord, now: Date): MatchSnapshot {
  return {
    id: m.id,
    provider: m.provider,
    competition: m.competition,
    homeName: m.homeName,
    awayName: m.awayName,
    startsAt: m.startsAt.toISOString(),
    stage: matchStage(m, now),
    statusSource: m.statusSource,
    statusCheckedAt: m.statusCheckedAt.toISOString(),
    resultSummary: m.resultSummary,
    url: m.url,
  };
}

function ist(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) + ` (${timeZone})`;
}

/** Notes for the model: facts with their source and age, plus the rule for this stage. */
export function matchNotes(s: MatchSnapshot, timeZone: string, publishAt: Date | null): string[] {
  const by = PROVIDER_LABEL[s.provider] ?? s.provider;
  const notes = [
    `MATCH (from ${by}; status checked ${s.statusCheckedAt}): ${s.homeName} vs ${s.awayName}, ${s.competition}, scheduled start ${ist(s.startsAt, timeZone)}. Verified stage: ${s.stage}.`,
  ];
  // Only a live-status provider's result counts as a fact; community/schedule data is not verified.
  if (s.stage === "completed" && s.resultSummary && s.statusSource === "provider") notes.push(`MATCH RESULT (from ${by}): ${s.resultSummary}`);
  else if (s.stage === "completed" && s.resultSummary) {
    notes.push(`MATCH RESULT NOT VERIFIED: ${by} lists a result, but it is not from a live-status provider. Do not state the score or winner; talk about the video's moments in general terms.`);
  }
  notes.push(`MATCH RULE: ${STAGE_GUIDANCE[s.stage]}`);
  if (publishAt && s.stage === "upcoming" && publishAt.getTime() >= new Date(s.startsAt).getTime()) {
    notes.push("PUBLISH TIME: the creator will post after the scheduled start. Do not write it as a pre-match preview; keep timing words neutral.");
  }
  return notes;
}




export interface SportsContextResult {
  used: SportsContextUsed | null;
  notes: string[];
  intent: SportsIntent;
  match: MatchRecord | null;
  stage: MatchStage | null;
  /** Extra text for the search-trend matcher, e.g. "India vs Australia ind vs aus". */
  trendTerms: string;
}

export async function buildSportsContext(
  db: DB,
  userId: string,
  opts: {
    text: string;
    matchId: string | null;
    publishAt: string | null;
    timeZone: string;
    now?: Date;
    /** Creator corrections from the interpretation chip. */
    sportOverride?: "cricket" | "football" | "none" | null;
    aliasChoices?: Record<string, string>;
    intentOverride?: SportsIntent["contentType"] | null;
  },
): Promise<SportsContextResult> {
  const now = opts.now ?? new Date();
  const choices = opts.aliasChoices ?? {};
  let intent = parseSportsIntent(opts.text, { now, aliasChoices: choices });
  if (opts.sportOverride === "none") intent = parseSportsIntent("", { now });
  else if (opts.sportOverride && intent.sport !== opts.sportOverride) intent = parseSportsIntent(`${opts.text} ${opts.sportOverride} match`, { now, aliasChoices: choices });
  if (opts.intentOverride && intent.sport) {
    intent = { ...intent, contentType: opts.intentOverride, timeRef: opts.intentOverride === "historical_highlight" ? "historical" : intent.timeRef === "historical" ? null : intent.timeRef };
  }
  const publishAt = opts.publishAt ? new Date(opts.publishAt) : null;

  let match: MatchRecord | null = null;
  let candidates: MatchRecord[] = [];
  if (opts.matchId) match = await getMatch(db, userId, opts.matchId);
  if (!match && intent.sport) {
    // Cached data only: background jobs keep fixtures fresh; a caption never waits on a provider.
    const pool = await listMatchesFor(db, userId, { sport: intent.sport, from: new Date(now.getTime() - 10 * 86_400_000), to: new Date(now.getTime() + 14 * 86_400_000) });
    const res = resolveMatch(intent, pool, now, opts.timeZone);
    if (res.kind === "single") match = res.match;
    if (res.kind === "ambiguous") candidates = res.candidates;
  }

  const teamNames = intent.teamIds.map((id) => TEAM_BY_ID.get(id)?.name ?? id);
  const teamShort = intent.teamIds.map((id) => TEAM_BY_ID.get(id)?.short ?? "");

  if (!intent.sport && !match) return { used: null, notes: [], trendTerms: "", intent, match: null, stage: null };

  // Stage the caption is written for: posting after kick-off with an unknown result → neutral.
  const stage = match ? writingStage(match, now, publishAt) : null;
  const snap = match ? { ...snapshot(match, now), stage: stage! } : null;
  const notes: string[] = [];
  if (snap) notes.push(...matchNotes(snap, opts.timeZone, publishAt));
  else if (candidates.length) {
    notes.push(
      `MATCH UNCONFIRMED: ${candidates.length} fixtures fit (${candidates.map((c) => `${c.homeName} vs ${c.awayName} on ${c.startsAt.toISOString().slice(0, 10)}`).join("; ")}). The creator has not said which. Do not state a date, result, score or live status; keep match references general.`,
    );
  } else {
    notes.push("SPORTS CAPTION, NO VERIFIED FIXTURE: do not state match dates, results, scores, playing XI, injuries or records. Keep to what the caption says.");
  }
  const question = intent.question
    ? {
        kind: intent.question.kind,
        alias: intent.question.alias ?? null,
        options: intent.question.options.map((id) => ({ id, name: TEAM_BY_ID.get(id)?.name ?? PLAYERS.find((p) => p.id === id)?.name ?? id })),
      }
    : null;
  if (question) {
    notes.push(
      `UNCLEAR SUBJECT: "${question.alias ?? "the subject"}" could mean ${question.options.map((o) => o.name).join(", ")}. Do not name any one of them as fact; keep wording general and use clarifyingQuestion to ask which one. Still write every platform entry with all three options (general wording).`,
    );
  }

  const used: SportsContextUsed = {
    sport: intent.sport ?? (match ? match.sport : null),
    teams: teamNames,
    players: intent.playerIds.map((id) => PLAYERS.find((p) => p.id === id)?.name ?? id),
    contentType: intent.contentType,
    timeRef: intent.timeRef,
    match: snap,
    candidates: candidates.map((c) => snapshot(c, now)),
    // Filled from the gated evidence bundle by the caller.
    references: [],
    publishAt: opts.publishAt,
    question,
  };
  const vs = match ? `${match.homeName} vs ${match.awayName}` : teamNames.join(" vs ");
  const shortVs = teamShort.filter(Boolean).join(" vs ");
  return { used, notes, trendTerms: `${vs} ${shortVs}`.trim(), intent, match, stage };
}


export const SPORTS_SOURCE_NAME = (provider: string) => SOURCE_NAMES[provider] ?? PROVIDER_LABEL[provider] ?? provider;
