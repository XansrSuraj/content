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

/** Club words shared by many teams ("Leeds United", "Newcastle United") — never a match on their own. */
const GENERIC_CLUB_WORDS = new Set([
  "united", "city", "real", "athletic", "atletico", "sporting", "racing", "inter", "olympique", "borussia", "dynamo",
  "rapid", "union", "stade", "sport", "town", "county", "rovers", "wanderers", "saint", "young", "boys", "women",
]);

/** OpenLigaDB uses German city names ("Inter Mailand"); map them to the names other providers use. */
const CITY_EXONYMS: Record<string, string> = {
  mailand: "milano", milan: "milano", munchen: "munich", rom: "roma", turin: "torino", neapel: "napoli", lissabon: "lisboa",
  prag: "praha", kopenhagen: "kobenhavn", belgrad: "beograd", moskau: "moscow", warschau: "warszawa", florenz: "fiorentina",
};

function nameTokens(s: string): string[] {
  return canonical(s)
    .split(" ")
    .map((w) => CITY_EXONYMS[w] ?? w)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !GENERIC_CLUB_WORDS.has(w));
}

/**
 * Whether two providers' names mean the same team ("Galatasaray Istanbul" / "Galatasaray SK",
 * "Club Brugge KV" / "FC Brügge"): same name without affixes, or a shared distinctive word.
 * Only used to merge fixtures that already share sport, category and kick-off time.
 */
export function sameTeamName(a: string, b: string): boolean {
  const ca = canonical(a);
  if (ca && ca === canonical(b)) return true;
  const tb = nameTokens(b);
  return nameTokens(a).some((x) => tb.includes(x));
}

/** Both sides are the same teams, in either order. */
export function sameFixtureNames(home1: string, away1: string, home2: string, away2: string): boolean {
  return (sameTeamName(home1, home2) && sameTeamName(away1, away2)) || (sameTeamName(home1, away2) && sameTeamName(away1, home2));
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
