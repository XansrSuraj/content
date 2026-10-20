import {
  AMBIGUOUS_ALIASES,
  COMPETITIONS,
  PLAYERS,
  TEAMS,
  TEAM_BY_ID,
  aliasText,
  isWeak,
  normalizeName,
  type Category,
  type Sport,
} from "./entities";

export type ContentType = "preview" | "prediction" | "analysis" | "reaction" | "recap" | "historical_highlight" | "meme" | "fan_opinion" | "unknown";
export type TimeRef =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "kal_ambiguous"
  | "day_before_yesterday"
  | "day_after_tomorrow"
  | "parso_ambiguous"
  | "last_match"
  | "next_match"
  | "explicit_date"
  | "historical"
  | null;

export interface Ambiguity {
  alias: string;
  kind: "team" | "player";
  candidates: string[];
}

export interface SportsQuestion {
  kind: "which_team" | "which_player" | "which_sport";
  alias?: string;
  options: string[];
}

export interface SportsIntent {
  sport: Sport | null;
  teamIds: string[];
  playerIds: string[];
  competitionId: string | null;
  /** men / women / youth (kept as `gender` for older callers: men|women). */
  category: Category;
  gender: "men" | "women";
  contentType: ContentType;
  timeRef: TimeRef;
  /** YYYY-MM-DD when the caption names a date ("21 Oct"). */
  explicitDate: string | null;
  /** A past year the caption names ("2016 wali century"). */
  year: number | null;
  tense: "past" | "future" | null;
  language: "hinglish" | "hindi" | "english";
  confidence: { sport: number; teams: number; intent: number; time: number };
  ambiguities: Ambiguity[];
  /** At most one targeted question, only when the subject itself is unclear. */
  question: SportsQuestion | null;
  /** What the caption does not say but the match lookup needs. */
  missing: ("teams" | "which_match")[];
}

const SPORT_WORDS: Record<Sport, RegExp> = {
  cricket:
    /\b(cricket|ipl|wpl|t20i?|odi|test match|wicket|wickets|century|fifty|innings|toss|overs|sixer|six|boundary|bowler|batting|bowling|run chase|asia cup|ranji|yorker|caught|lbw)\b|क्रिकेट|विकेट|शतक|पारी|टॉस|छक्का|चौका/i,
  football: /\b(football|soccer|premier league|epl|la liga|laliga|bundesliga|serie a|ligue 1|champions league|ucl|isl|penalty shootout|hat-?trick|striker|midfielder|goalkeeper|free kick|offside|var)\b|फुटबॉल/i,
};
// Only words that mean a sports match; "jeet", "haar" (also: necklace), "goal" and "score" are too common.
const GENERIC_MATCH =
  /\b(match|vs|versus|fixture|khelenge|khelega|khelegi|khela|khele|khel rahe|jeet gaye|jeet gayi|haar gaye|haar gayi|won by|lost to|derby|el clasico|clasico)\b|मैच|बनाम|खेलेंगे|खेलेगा|खेला|खेले|जीत गए|हार गए/i;

const PAST =
  /\b(gaye|gayi|gaya|gye|gya|gyi|tha|thi|jeeta|jeete|jeeti|haara|hara|haare|haari|kiya|kiye|hua|hui|hue|khela|khele|maara|maari|banaya|banaye|scored|won|lost|beat|defeated|was|were|played|did|recap)\b|jo hua|गए|गया|गई|था|थी|थे|जीता|जीते|जीती|हारा|हारे|हारी|किया|हुआ|हुई|खेला|खेले|मारा|बनाया|जो हुआ/i;
const FUTURE =
  /\b(khelenge|khelega|khelegi|hoga|hogi|honge|jeetenge|jeetega|jeetegi|haarenge|dekhenge|dekhna|karenge|aayega|will|going to|preview|prediction|predict|upcoming|tonight)\b|kaun jeetega|who will win|hone wala|hone wali|खेलेंगे|खेलेगा|खेलेगी|होगा|होगी|होंगे|जीतेगा|जीतेंगे|देखेंगे|देखना|करेंगे|कौन जीतेगा|होने वाला/i;

const CONTENT: [ContentType, RegExp][] = [
  ["historical_highlight", /\b(throwback|flashback|tbt|old memories|purani yaad|purani yaadein|yaad hai|classic innings|legendary|back in)\b|पुरानी याद|याद है/i],
  ["prediction", /\b(prediction|predict|predicted|kaun jeetega|who will win|my pick|dream11 team)\b|कौन जीतेगा|भविष्यवाणी/i],
  ["preview", /\b(preview|before the match|match se pehle|playing 11 kya|playing xi kya|expectations?|build ?up)\b|मैच से पहले/i],
  ["meme", /\b(meme|memes|troll|trolling|roast|funny edit|😂)\b|मीम/i],
  ["fan_opinion", /\b(opinion|hot take|unpopular opinion|meri raay|mera manna|mujhe lagta|i think|overrated|underrated)\b|मेरी राय|मुझे लगता/i],
  ["analysis", /\b(analysis|analyse|analyze|breakdown|tactics|tactical|kyun haare|kyun jeete|why .* (lost|won)|stats)\b|विश्लेषण/i],
  ["recap", /\b(recap|highlights?|summary|kya hua|jo hua|match report|best moments|top moments)\b|हाइलाइट्स|क्या हुआ|जो हुआ/i],
  ["reaction", /\b(reaction|react|reacting|celebration|celebrate|khushi|dil toot|heartbreak|emotional)\b|रिएक्शन|जश्न/i],
];

/** Ambiguous aliases that are also everyday English words ("a real match", "city lights"). */
const COMMON_WORD_ALIASES = new Set(["real", "city", "united", "king"]);

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function hasAlias(padded: string, alias: string): boolean {
  const a = normalizeName(aliasText(alias));
  return a.length > 0 && padded.includes(` ${a} `);
}

export function detectLanguage(text: string): "hinglish" | "hindi" | "english" {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  if (letters.length && deva / letters.length > 0.3) return "hindi";
  if (/\b(hai|hain|ka|ki|ke|kya|mein|nahi|nhi|aaj|kal|karo|tha|thi|yeh|ye|bhai|yaar|toh|bhi|wala|wali|kaun|kaise|jeet|dekho|mera|meri|apna|hoga)\b/i.test(text)) return "hinglish";
  return "english";
}

function explicitDate(raw: string, now: Date): string | null {
  const y = now.getUTCFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = raw.match(/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/i);
  if (m) return `${y}-${pad(MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3)] ?? 1)}-${pad(Number(m[1]))}`;
  m = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s*(\d{1,2})\b/i);
  if (m) return `${y}-${pad(MONTHS[m[1].toLowerCase().slice(0, 3)] ?? 1)}-${pad(Number(m[2]))}`;
  m = raw.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) {
    const yy = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : y;
    return `${yy}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  return null;
}

/**
 * Reads sport, teams, players, competition, category, intent, dates, language and
 * confidence out of a caption. Deterministic and conservative: weak aliases need a
 * sports signal, ambiguous aliases are only resolved by context, and nothing is
 * resolved to a match here.
 */
export function parseSportsIntent(text: string, opts: { now?: Date } = {}): SportsIntent {
  const now = opts.now ?? new Date();
  const padded = ` ${normalizeName(text)} `;
  const raw = text.toLowerCase();
  const language = detectLanguage(text);
  const sportHint = (["cricket", "football"] as Sport[]).filter((s) => SPORT_WORDS[s].test(raw));
  const signal = sportHint.length > 0 || GENERIC_MATCH.test(raw);

  const strongTeams = TEAMS.filter((t) => t.aliases.some((a) => !isWeak(a) && hasAlias(padded, a)));
  const strongPlayers = PLAYERS.filter((p) => p.aliases.some((a) => !isWeak(a) && hasAlias(padded, a)));
  const comps = COMPETITIONS.filter((c) => c.aliases.some((a) => hasAlias(padded, a)));
  const anySignal = signal || strongTeams.length > 0 || strongPlayers.length > 0 || comps.length > 0;

  let teams = anySignal ? TEAMS.filter((t) => t.aliases.some((a) => hasAlias(padded, a))) : [];
  let players = anySignal ? PLAYERS.filter((p) => p.aliases.some((a) => hasAlias(padded, a))) : [];
  const usedWeak = anySignal && teams.some((t) => !strongTeams.includes(t));

  // Category: women / youth signals, or a women's competition.
  let category: Category = /\b(women|womens|women's|mahila|ladies)\b|महिला/i.test(raw) || comps.some((c) => c.category === "women") ? "women" : "men";
  if (/\b(u-?19|under[- ]19|u19)\b/i.test(raw)) category = "youth";

  // Sport: explicit words win; otherwise competitions, then entities.
  const votes = new Map<Sport, number>();
  for (const s of sportHint) votes.set(s, (votes.get(s) ?? 0) + 3);
  for (const c of comps) votes.set(c.sport, (votes.get(c.sport) ?? 0) + 2);
  for (const t of teams) votes.set(t.sport, (votes.get(t.sport) ?? 0) + 1);
  for (const p of players) votes.set(p.sport, (votes.get(p.sport) ?? 0) + 1);
  // An ambiguous alias ("MI ka match") still says which sport the caption is about.
  const strongSignal = sportHint.length > 0 || teams.length > 0 || players.length > 0 || comps.length > 0;
  const ambiguousPresent = (alias: string) => hasAlias(padded, alias) && (strongSignal || !COMMON_WORD_ALIASES.has(alias));
  if (anySignal) for (const amb of AMBIGUOUS_ALIASES) if (ambiguousPresent(amb.alias)) votes.set(amb.sport, (votes.get(amb.sport) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const sport = ranked[0]?.[0] ?? null;
  const sportTie = ranked.length > 1 && ranked[0][1] === ranked[1][1];

  // Ambiguous aliases (MI, United, Real, City, King, Ronaldo): resolved only by context.
  const ambiguities: Ambiguity[] = [];
  if (anySignal) {
    for (const amb of AMBIGUOUS_ALIASES) {
      if (sport && amb.sport !== sport) continue;
      if (!ambiguousPresent(amb.alias)) continue;
      const taken = new Set([...teams.map((t) => t.id), ...players.map((p) => p.id)]);
      // A strong alias of a candidate already named elsewhere ("Man U vs United") is not this alias.
      const candidates = amb.candidates.filter((c) => !taken.has(c));
      if (candidates.length === 0) continue;
      const otherComps = new Set([...teams.flatMap((t) => t.competitions), ...comps.map((c) => c.id)]);
      const scored = candidates.map((c) => {
        let score = (amb.context[c] ?? []).filter((w) => hasAlias(padded, w) || raw.includes(w)).length * 2;
        const team = TEAM_BY_ID.get(c);
        if (team) {
          if (team.competitions.some((x) => otherComps.has(x))) score += 2;
          if (team.category !== "men" && team.category === category) score += 2;
          if (team.category === "women" && category !== "women") score -= 3;
        }
        return { c, score };
      });
      const best = Math.max(...scored.map((s) => s.score));
      const top = scored.filter((s) => s.score === best);
      if (best > 0 && top.length === 1) {
        const id = top[0].c;
        if (amb.kind === "team") teams = [...teams, TEAM_BY_ID.get(id)!].filter(Boolean);
        else players = [...players, PLAYERS.find((p) => p.id === id)!].filter(Boolean);
      } else {
        ambiguities.push({ alias: amb.alias, kind: amb.kind, candidates });
      }
    }
  }

  // Category also follows the teams found ("RCB women" etc.); men/women versions of a team are never both kept.
  if (teams.some((t) => t.category === "women")) category = "women";
  // For a women's match, "India" / "RCB" mean the women's teams.
  const byCategory =
    category === "women"
      ? teams.map((t) => (t.category === "women" ? t : (TEAM_BY_ID.get(`${t.id}_w`) ?? t)))
      : teams.filter((t) => t.category !== "women");
  const sportTeams = sport ? dedupe(byCategory.filter((t) => t.sport === sport)) : [];
  const sportPlayers = sport ? players.filter((p) => p.sport === sport) : [];

  if (!sport || (sportTeams.length === 0 && sportPlayers.length === 0 && sportHint.length === 0 && comps.length === 0 && ambiguities.length === 0)) {
    return empty(language);
  }

  const tense = PAST.test(raw) && !FUTURE.test(raw) ? "past" : FUTURE.test(raw) && !PAST.test(raw) ? "future" : null;
  const yearMatch = raw.match(/\b(19[5-9]\d|20\d{2})\b/);
  const year = yearMatch && Number(yearMatch[1]) < now.getUTCFullYear() ? Number(yearMatch[1]) : null;
  let contentType: ContentType = CONTENT.find(([, re]) => re.test(raw))?.[0] ?? "unknown";
  if (year) contentType = "historical_highlight";

  let timeRef: TimeRef = null;
  const date = explicitDate(raw, now);
  if (contentType === "historical_highlight") timeRef = "historical";
  else if (/\b(last match|pichla match|pichle match|previous match|last game)\b|पिछला मैच|पिछले मैच/i.test(raw)) timeRef = "last_match";
  else if (/\b(next match|agla match|agle match|upcoming match|next game)\b|अगला मैच|अगले मैच/i.test(raw)) timeRef = "next_match";
  else if (date) timeRef = "explicit_date";
  else if (/\b(aaj|today|tonight|abhi)\b|aaj raat|आज/i.test(raw)) timeRef = "today";
  else if (/\byesterday\b/i.test(raw)) timeRef = "yesterday";
  else if (/\btomorrow\b/i.test(raw)) timeRef = "tomorrow";
  // "parso" and "kal" both point either way; the verb tense decides, otherwise they stay ambiguous.
  else if (/\bparso\b|परसों/i.test(raw)) timeRef = tense === "past" ? "day_before_yesterday" : tense === "future" ? "day_after_tomorrow" : "parso_ambiguous";
  else if (/\bkal\b|कल/i.test(raw)) timeRef = tense === "past" ? "yesterday" : tense === "future" ? "tomorrow" : "kal_ambiguous";

  const missing: SportsIntent["missing"] = [];
  if (sportTeams.length === 0) missing.push("teams");
  if (!timeRef && contentType === "unknown") missing.push("which_match");

  const teamAmb = ambiguities.find((a) => a.kind === "team");
  const playerAmb = ambiguities.find((a) => a.kind === "player");
  const question: SportsQuestion | null = teamAmb
    ? { kind: "which_team", alias: teamAmb.alias, options: teamAmb.candidates }
    : playerAmb
      ? { kind: "which_player", alias: playerAmb.alias, options: playerAmb.candidates }
      : sportTie && sportHint.length === 0
        ? { kind: "which_sport", options: ["cricket", "football"] }
        : null;

  return {
    sport,
    teamIds: sportTeams.map((t) => t.id).slice(0, 2),
    playerIds: sportPlayers.map((p) => p.id),
    competitionId: comps.find((c) => c.sport === sport && (c.category === category || category === "youth"))?.id ?? comps.find((c) => c.sport === sport)?.id ?? null,
    category,
    gender: category === "women" ? "women" : "men",
    contentType,
    timeRef,
    explicitDate: timeRef === "explicit_date" ? date : null,
    year,
    tense,
    language,
    confidence: {
      sport: sportHint.length ? 0.95 : sportTie ? 0.4 : strongTeams.length || strongPlayers.length || comps.length ? 0.85 : 0.6,
      teams: teamAmb ? 0.3 : sportTeams.length === 0 ? 0 : usedWeak ? 0.65 : 0.9,
      intent: contentType !== "unknown" ? 0.8 : tense ? 0.5 : 0.2,
      time: timeRef === "kal_ambiguous" || timeRef === "parso_ambiguous" ? 0.3 : timeRef ? 0.85 : 0,
    },
    ambiguities,
    question,
    missing,
  };
}

function empty(language: SportsIntent["language"]): SportsIntent {
  return {
    sport: null, teamIds: [], playerIds: [], competitionId: null, category: "men", gender: "men", contentType: "unknown", timeRef: null,
    explicitDate: null, year: null, tense: null, language, confidence: { sport: 0, teams: 0, intent: 0, time: 0 }, ambiguities: [], question: null, missing: [],
  };
}

function dedupe<T extends { id: string }>(teams: T[]): T[] {
  const seen = new Set<string>();
  return teams.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
