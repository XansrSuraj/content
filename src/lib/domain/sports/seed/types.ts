/**
 * Seed data format for sports entities. Kept as plain data so it can be reviewed
 * and extended without touching matching logic.
 *
 * Alias conventions:
 *  - Plain alias: strong — it can only mean this entity in a caption.
 *  - "~alias": weak — also an everyday word ("virat" = huge, "hardik" = heartfelt,
 *    country/city names in travel or food captions). Counts only with a sports signal.
 *  - Aliases that genuinely point at several entities ("MI", "United", "Real",
 *    "Ronaldo") are NOT listed on any entity; they live in AMBIGUOUS_ALIASES with
 *    context clues per candidate.
 */

export type Sport = "cricket" | "football";
export type Category = "men" | "women" | "youth" | "other";

export interface TeamSeed {
  id: string;
  sport: Sport;
  name: string;
  short: string;
  kind: "national" | "club" | "franchise";
  category: Category;
  /** Competition ids this team usually plays in (helps disambiguation, never asserts a fixture). */
  competitions: string[];
  aliases: string[];
}

export interface PlayerSeed {
  id: string;
  sport: Sport;
  name: string;
  category: Category;
  aliases: string[];
}

export interface CompetitionSeed {
  id: string;
  sport: Sport;
  name: string;
  format: "t20" | "odi" | "test" | "multi" | "league" | "cup";
  category: Category;
  aliases: string[];
}

export interface AmbiguousAlias {
  alias: string;
  sport: Sport;
  kind: "team" | "player";
  candidates: string[];
  /** Words that, when present in the caption, point to one candidate. */
  context: Record<string, string[]>;
}
