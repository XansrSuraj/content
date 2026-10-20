import { normalizeName, PLAYERS, TEAMS, type Sport } from "./entities";

export type ContentType = "preview" | "prediction" | "reaction" | "analysis" | "highlights" | "unknown";
export type TimeRef = "today" | "yesterday" | "tomorrow" | "kal_ambiguous" | "last_match" | "next_match" | null;

export interface SportsIntent {
  sport: Sport | null;
  teamIds: string[];
  playerIds: string[];
  gender: "men" | "women";
  contentType: ContentType;
  timeRef: TimeRef;
  tense: "past" | "future" | null;
  /** What the caption does not say but the match lookup needs. */
  missing: ("teams" | "which_match")[];
}

const SPORT_WORDS: Record<Sport, RegExp> = {
  cricket:
    /\b(cricket|ipl|wpl|t20i?|odi|test match|wicket|wickets|century|fifty|innings|toss|overs|sixer|boundary|bowler|batting|bowling|run chase|world cup|asia cup|ranji)\b|क्रिकेट|विकेट|शतक|पारी|टॉस|छक्का|चौका/i,
  football: /\b(football|soccer|premier league|epl|la liga|laliga|bundesliga|serie a|ligue 1|champions league|ucl|fifa|isl|penalty shootout|hat-?trick|striker|midfielder|goalkeeper)\b|फुटबॉल/i,
};
// Only words that mean a sports match; "jeet", "haar" (also: necklace), "goal" and "score" are too common.
const GENERIC_MATCH =
  /\b(match|vs|versus|fixture|khelenge|khelega|khelegi|khela|khele|khel rahe|jeet gaye|jeet gayi|haar gaye|haar gayi|won by|lost to)\b|मैच|बनाम|खेलेंगे|खेलेगा|खेला|खेले|जीत गए|हार गए/i;
const VS_PATTERN = /\b(vs?|versus)\b|बनाम/i;

const PAST =
  /\b(gaye|gayi|gaya|gye|gya|gyi|tha|thi|jeeta|jeete|jeeti|haara|hara|haare|haari|kiya|kiye|hua|hui|hue|khela|khele|maara|maari|banaya|banaye|scored|won|lost|beat|defeated|was|were|played|did|recap)\b|गए|गया|गई|था|थी|थे|जीता|जीते|जीती|हारा|हारे|हारी|किया|हुआ|हुई|खेला|खेले|मारा|बनाया/i;
const FUTURE =
  /\b(khelenge|khelega|khelegi|hoga|hogi|honge|jeetenge|jeetega|jeetegi|haarenge|dekhenge|karenge|aayega|will|going to|preview|prediction|predict|upcoming)\b|kaun jeetega|who will win|खेलेंगे|खेलेगा|खेलेगी|होगा|होगी|होंगे|जीतेगा|जीतेंगे|देखेंगे|करेंगे|कौन जीतेगा/i;

const CONTENT: [ContentType, RegExp][] = [
  ["prediction", /\b(prediction|predict|kaun jeetega|who will win|my pick)\b|कौन जीतेगा|भविष्यवाणी/i],
  ["preview", /\b(preview|before the match|match se pehle|playing 11 kya|expectations?|build ?up)\b|मैच से पहले/i],
  ["highlights", /\b(highlights?|best moments|top moments)\b|हाइलाइट्स/i],
  ["analysis", /\b(analysis|analyse|analyze|breakdown|tactics|kyun haare|kyun jeete|why .* (lost|won)|stats)\b|विश्लेषण/i],
  ["reaction", /\b(reaction|react|reacting|celebration|celebrate|khushi|dil toot|heartbreak|emotional)\b|रिएक्शन|जश्न/i],
];

function hasAlias(padded: string, alias: string): boolean {
  const a = normalizeName(alias.replace(/^~/, ""));
  return a.length > 0 && padded.includes(` ${a} `);
}

/**
 * Reads sport, teams, players, content type and time reference out of a caption.
 * Deterministic and conservative: weak aliases need a sports signal, and nothing
 * is resolved to a match here.
 */
export function parseSportsIntent(text: string): SportsIntent {
  const padded = ` ${normalizeName(text)} `;
  const raw = text.toLowerCase();
  const sportHint = (["cricket", "football"] as Sport[]).filter((s) => SPORT_WORDS[s].test(raw));
  const signal = sportHint.length > 0 || GENERIC_MATCH.test(raw);

  // Strong aliases always count; weak ones (everyday words) only with a sports signal.
  const strongTeams = TEAMS.filter((t) => t.aliases.some((a) => !a.startsWith("~") && hasAlias(padded, a)));
  const strongPlayers = PLAYERS.filter((p) => p.aliases.some((a) => !a.startsWith("~") && hasAlias(padded, a)));
  const anySignal = signal || strongTeams.length > 0 || strongPlayers.length > 0;
  const shortCodes = VS_PATTERN.test(raw) ? TEAMS.filter((t) => hasAlias(padded, t.short)) : [];
  const teams = anySignal
    ? TEAMS.filter((t) => t.aliases.some((a) => hasAlias(padded, a)) || shortCodes.includes(t))
    : [];
  const players = anySignal ? PLAYERS.filter((p) => p.aliases.some((a) => hasAlias(padded, a))) : [];

  // Sport: explicit words win; otherwise the entities found decide.
  const votes = new Map<Sport, number>();
  for (const s of sportHint) votes.set(s, (votes.get(s) ?? 0) + 3);
  for (const t of teams) votes.set(t.sport, (votes.get(t.sport) ?? 0) + 1);
  for (const p of players) votes.set(p.sport, (votes.get(p.sport) ?? 0) + 1);
  const sport = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const sportTeams = sport ? dedupeNational(teams.filter((t) => t.sport === sport)) : [];
  const sportPlayers = sport ? players.filter((p) => p.sport === sport) : [];
  if (!sport || (sportTeams.length === 0 && sportPlayers.length === 0 && sportHint.length === 0)) {
    return { sport: null, teamIds: [], playerIds: [], gender: "men", contentType: "unknown", timeRef: null, tense: null, missing: [] };
  }

  const tense = PAST.test(raw) && !FUTURE.test(raw) ? "past" : FUTURE.test(raw) && !PAST.test(raw) ? "future" : null;
  const contentType = CONTENT.find(([, re]) => re.test(raw))?.[0] ?? "unknown";

  let timeRef: TimeRef = null;
  if (/\b(last match|pichla match|pichle match|previous match|last game)\b|पिछला मैच|पिछले मैच/i.test(raw)) timeRef = "last_match";
  else if (/\b(next match|agla match|agle match|upcoming match|next game)\b|अगला मैच|अगले मैच/i.test(raw)) timeRef = "next_match";
  else if (/\b(aaj|today|tonight|abhi)\b|आज/i.test(raw)) timeRef = "today";
  else if (/\byesterday\b/i.test(raw)) timeRef = "yesterday";
  else if (/\btomorrow\b/i.test(raw)) timeRef = "tomorrow";
  // "kal" means both yesterday and tomorrow; the verb tense decides, otherwise it stays ambiguous.
  else if (/\bkal\b|कल/i.test(raw)) timeRef = tense === "past" ? "yesterday" : tense === "future" ? "tomorrow" : "kal_ambiguous";

  const gender = /\b(women|womens|women's|mahila|wpl|ladies)\b|महिला/i.test(raw) ? "women" : "men";
  const missing: SportsIntent["missing"] = [];
  if (sportTeams.length === 0) missing.push("teams");
  if (!timeRef && contentType === "unknown") missing.push("which_match");

  return {
    sport,
    teamIds: sportTeams.map((t) => t.id).slice(0, 2),
    playerIds: sportPlayers.map((p) => p.id),
    gender,
    contentType,
    timeRef,
    tense,
    missing,
  };
}

/** "India" the cricket team and an IPL city alias can both match; keep the more specific entries first. */
function dedupeNational<T extends { id: string }>(teams: T[]): T[] {
  const seen = new Set<string>();
  return teams.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
