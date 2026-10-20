import "server-only";
import type { DB } from "@/lib/db/client";
import type { MatchSnapshot, ReferenceSnapshot, SportsContextUsed } from "@/lib/db/schema";
import { TEAM_BY_ID, PLAYERS } from "@/lib/domain/sports/entities";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { matchStage, resolveMatch, STAGE_GUIDANCE, type MatchRecord } from "@/lib/domain/sports/resolve";
import { refreshSportsIfStale } from "@/lib/jobs/sports-ingest";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { getMatch, listMatchesFor, listReferencesFor, type ReferenceRow } from "@/lib/repo/sports";
import { tokens } from "./trend-context";

const PROVIDER_LABEL: Record<string, string> = {
  openfootball: "openfootball fixture list (schedule only, no live status)",
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
  if (s.stage === "completed" && s.resultSummary) notes.push(`MATCH RESULT (from ${by}): ${s.resultSummary}`);
  notes.push(`MATCH RULE: ${STAGE_GUIDANCE[s.stage]}`);
  if (publishAt && s.stage === "upcoming" && publishAt.getTime() >= new Date(s.startsAt).getTime()) {
    notes.push("PUBLISH TIME: the creator will post after the scheduled start. Do not write it as a pre-match preview; keep timing words neutral.");
  }
  return notes;
}

function referenceNote(r: ReferenceSnapshot): string {
  const when = r.observedAt.slice(0, 10);
  if (r.evidenceType === "creator_reference") return `REFERENCE (creator-provided, not verified): ${r.platform} — "${r.topic}"${r.url ? ` — ${r.url}` : ""} (added ${when})`;
  if (r.evidenceType === "csv_import") return `SEARCH DATA (${r.sourceTool}, imported ${when}): related query "${r.topic}" on ${r.platform}`;
  return `PLATFORM TOOL OBSERVATION (${r.sourceTool}, seen by an admin on ${when}): "${r.topic}" on ${r.platform}`;
}

function toReference(r: ReferenceRow): ReferenceSnapshot {
  return { platform: r.platform, topic: r.topic, url: r.url, evidenceType: r.evidenceType, sourceTool: r.sourceTool, observedAt: r.observedAt.toISOString() };
}

/** References whose topic shares a meaningful word with the caption (or appears whole). */
export function matchingReferences(text: string, refs: ReferenceRow[], extraTerms: string[] = [], limit = 4): ReferenceRow[] {
  const words = new Set([...tokens(text), ...extraTerms.flatMap((t) => tokens(t))]);
  const lowered = text.toLowerCase();
  return refs
    .filter((r) => {
      const topic = r.topic.toLowerCase();
      return lowered.includes(topic) || tokens(topic).some((w) => w.length >= 4 && words.has(w));
    })
    .slice(0, limit);
}

export interface SportsContextResult {
  used: SportsContextUsed | null;
  notes: string[];
  /** Extra text for the search-trend matcher, e.g. "India vs Australia ind vs aus". */
  trendTerms: string;
}

export async function buildSportsContext(
  db: DB,
  userId: string,
  opts: { text: string; matchId: string | null; publishAt: string | null; timeZone: string; now?: Date },
): Promise<SportsContextResult> {
  const now = opts.now ?? new Date();
  const intent = parseSportsIntent(opts.text);
  const publishAt = opts.publishAt ? new Date(opts.publishAt) : null;
  const refs = await listReferencesFor(db, userId, now);

  let match: MatchRecord | null = null;
  let candidates: MatchRecord[] = [];
  if (opts.matchId) match = await getMatch(db, userId, opts.matchId);
  if (!match && intent.sport) {
    // Bounded: the caption is never held up long by a slow fixtures provider.
    await refreshSportsIfStale(db, { now, sport: intent.sport, timeoutMs: 6_000 }).catch(() => undefined);
    const pool = await listMatchesFor(db, userId, { sport: intent.sport, from: new Date(now.getTime() - 10 * 86_400_000), to: new Date(now.getTime() + 14 * 86_400_000) });
    const res = resolveMatch(intent, pool, now, opts.timeZone);
    if (res.kind === "single") match = res.match;
    if (res.kind === "ambiguous") candidates = res.candidates;
  }

  const teamNames = intent.teamIds.map((id) => TEAM_BY_ID.get(id)?.name ?? id);
  const teamShort = intent.teamIds.map((id) => TEAM_BY_ID.get(id)?.short ?? "");
  const extraTerms = match ? [match.homeName, match.awayName, match.competition] : teamNames;
  const references = matchingReferences(opts.text, refs, extraTerms).map(toReference);

  if (!intent.sport && !match) {
    return { used: references.length ? emptyUsed(references, opts.publishAt) : null, notes: references.map(referenceNote), trendTerms: "" };
  }

  const snap = match ? snapshot(match, now) : null;
  const notes: string[] = [];
  if (snap) notes.push(...matchNotes(snap, opts.timeZone, publishAt));
  else if (candidates.length) {
    notes.push(
      `MATCH UNCONFIRMED: ${candidates.length} fixtures fit (${candidates.map((c) => `${c.homeName} vs ${c.awayName} on ${c.startsAt.toISOString().slice(0, 10)}`).join("; ")}). The creator has not said which. Do not state a date, result, score or live status; keep match references general.`,
    );
  } else {
    notes.push("SPORTS CAPTION, NO VERIFIED FIXTURE: do not state match dates, results, scores, playing XI, injuries or records. Keep to what the caption says.");
  }
  notes.push(...references.map(referenceNote));

  const used: SportsContextUsed = {
    sport: intent.sport ?? (match ? match.sport : null),
    teams: teamNames,
    players: intent.playerIds.map((id) => PLAYERS.find((p) => p.id === id)?.name ?? id),
    contentType: intent.contentType,
    timeRef: intent.timeRef,
    match: snap,
    candidates: candidates.map((c) => snapshot(c, now)),
    references,
    publishAt: opts.publishAt,
  };
  const vs = match ? `${match.homeName} vs ${match.awayName}` : teamNames.join(" vs ");
  const shortVs = teamShort.filter(Boolean).join(" vs ");
  return { used, notes, trendTerms: `${vs} ${shortVs}`.trim() };
}

function emptyUsed(references: ReferenceSnapshot[], publishAt: string | null): SportsContextUsed {
  return { sport: null, teams: [], players: [], contentType: "unknown", timeRef: null, match: null, candidates: [], references, publishAt };
}

export const SPORTS_SOURCE_NAME = (provider: string) => SOURCE_NAMES[provider] ?? PROVIDER_LABEL[provider] ?? provider;
