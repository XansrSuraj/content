/**
 * Index over the reviewable seed data in ./seed. No entity data lives here —
 * add teams, players, competitions and ambiguous aliases in the seed files.
 */
import { CRICKET_AMBIGUOUS, CRICKET_COMPETITIONS, CRICKET_PLAYERS, CRICKET_TEAMS } from "./seed/cricket";
import { FOOTBALL_AMBIGUOUS, FOOTBALL_COMPETITIONS, FOOTBALL_PLAYERS, FOOTBALL_TEAMS } from "./seed/football";
import type { AmbiguousAlias, CompetitionSeed, PlayerSeed, Sport, TeamSeed } from "./seed/types";

export type { Sport, Category } from "./seed/types";
export type Team = TeamSeed;
export type Player = PlayerSeed;
export type Competition = CompetitionSeed;

export const TEAMS: Team[] = [...CRICKET_TEAMS, ...FOOTBALL_TEAMS];
export const PLAYERS: Player[] = [...CRICKET_PLAYERS, ...FOOTBALL_PLAYERS];
export const COMPETITIONS: Competition[] = [...CRICKET_COMPETITIONS, ...FOOTBALL_COMPETITIONS];
export const AMBIGUOUS_ALIASES: AmbiguousAlias[] = [...CRICKET_AMBIGUOUS, ...FOOTBALL_AMBIGUOUS];

export const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
export const COMPETITION_BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c]));

export const isWeak = (alias: string) => alias.startsWith("~");
export const aliasText = (alias: string) => alias.replace(/^~/, "");
export const scriptOf = (alias: string): "deva" | "latin" => (/[ऀ-ॿ]/.test(alias) ? "deva" : "latin");

/** Lowercase, strip accents and punctuation (keeps Devanagari), collapse spaces. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** Provider names carry club affixes in different orders ("Arsenal FC", "FC Arsenal"); compare without them. */
const AFFIXES = new Set(["fc", "afc", "cf", "sc", "ssc", "club", "de", "football", "calcio"]);
function canonical(s: string): string {
  return normalizeName(s)
    .split(" ")
    .filter((w) => !AFFIXES.has(w))
    .join(" ");
}

/**
 * Finds a team id for a provider's team name (e.g. "FC Arsenal" → football:arsenal).
 * Exact canonical match only — provider names are never fuzzy-guessed. Women's teams
 * are picked when the provider name says "Women".
 */
export function teamIdForName(name: string, sport: Sport): string | null {
  const women = /\bwomen\b/i.test(name);
  const n = canonical(name.replace(/\bwomen\b/i, ""));
  if (!n) return null;
  for (const t of TEAMS) {
    if (t.sport !== sport) continue;
    if (women && t.category !== "women") continue;
    // Some women's franchises have no "Women" in their name (Gujarat Giants, UP Warriorz).
    if (!women && t.category === "women" && /Women$/.test(t.name)) continue;
    const base = t.category === "women" ? t.name.replace(/\s*Women$/, "") : t.name;
    if (canonical(base) === n || t.aliases.some((a) => canonical(aliasText(a)) === n)) return t.id;
  }
  return null;
}
