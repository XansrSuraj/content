/**
 * Teams and players TrendSaathi can recognise in a caption, with aliases in
 * English, Hindi (Devanagari) and common abbreviations. Every alias maps to one
 * stable id, so "RCB", "Royal Challengers Bengaluru" and "आरसीबी" are the same team.
 * Player entries only help understand the caption; they never assert a team.
 *
 * Aliases starting with "~" are weak: they are everyday words too ("virat" = huge,
 * "hardik" = heartfelt, country and city names in travel/food captions), so they
 * only count when the text also has a sports signal.
 */

export type Sport = "cricket" | "football";

export interface Team {
  id: string;
  sport: Sport;
  name: string;
  short: string;
  kind: "national" | "club" | "franchise";
  aliases: string[];
}

export interface Player {
  id: string;
  sport: Sport;
  name: string;
  aliases: string[];
}

const nat = (id: string, name: string, short: string, aliases: string[]): Team => ({ id: `cricket:${id}`, sport: "cricket", name, short, kind: "national", aliases });
const ipl = (id: string, name: string, short: string, aliases: string[]): Team => ({ id: `cricket:${id}`, sport: "cricket", name, short, kind: "franchise", aliases });
const club = (id: string, name: string, short: string, aliases: string[]): Team => ({ id: `football:${id}`, sport: "football", name, short, kind: "club", aliases });
const fnat = (id: string, name: string, short: string, aliases: string[]): Team => ({ id: `football:${id}`, sport: "football", name, short, kind: "national", aliases });

export const TEAMS: Team[] = [
  // Cricket — national teams
  nat("ind", "India", "IND", ["~india", "team india", "~bharat", "~भारत", "~इंडिया", "टीम इंडिया", "men in blue"]),
  nat("aus", "Australia", "AUS", ["~australia", "aussies", "kangaroos", "~ऑस्ट्रेलिया", "~आस्ट्रेलिया"]),
  nat("eng", "England", "ENG", ["~england", "~इंग्लैंड"]),
  nat("pak", "Pakistan", "PAK", ["~pakistan", "~पाकिस्तान"]),
  nat("sa", "South Africa", "SA", ["~south africa", "proteas", "~दक्षिण अफ्रीका", "~साउथ अफ्रीका"]),
  nat("nz", "New Zealand", "NZ", ["~new zealand", "~kiwis", "black caps", "~न्यूजीलैंड", "~न्यूज़ीलैंड"]),
  nat("sl", "Sri Lanka", "SL", ["~sri lanka", "~श्रीलंका"]),
  nat("ban", "Bangladesh", "BAN", ["~bangladesh", "~बांग्लादेश"]),
  nat("afg", "Afghanistan", "AFG", ["~afghanistan", "~अफगानिस्तान", "~अफ़ग़ानिस्तान"]),
  nat("wi", "West Indies", "WI", ["~west indies", "windies", "~वेस्टइंडीज", "~वेस्ट इंडीज"]),
  nat("ire", "Ireland", "IRE", ["~ireland"]),
  nat("zim", "Zimbabwe", "ZIM", ["~zimbabwe", "~जिम्बाब्वे"]),
  // Cricket — IPL
  ipl("csk", "Chennai Super Kings", "CSK", ["csk", "chennai super kings", "~chennai", "चेन्नई सुपर किंग्स", "सीएसके"]),
  ipl("mi", "Mumbai Indians", "MI", ["mumbai indians", "मुंबई इंडियंस", "~पलटन", "~paltan"]),
  ipl("rcb", "Royal Challengers Bengaluru", "RCB", ["rcb", "royal challengers bengaluru", "royal challengers bangalore", "~bengaluru", "~bangalore", "आरसीबी", "रॉयल चैलेंजर्स"]),
  ipl("kkr", "Kolkata Knight Riders", "KKR", ["kkr", "kolkata knight riders", "~kolkata", "केकेआर", "कोलकाता नाइट राइडर्स"]),
  ipl("srh", "Sunrisers Hyderabad", "SRH", ["srh", "sunrisers hyderabad", "sunrisers", "~hyderabad", "सनराइजर्स हैदराबाद"]),
  ipl("dc", "Delhi Capitals", "DC", ["delhi capitals", "दिल्ली कैपिटल्स"]),
  ipl("pbks", "Punjab Kings", "PBKS", ["pbks", "punjab kings", "पंजाब किंग्स"]),
  ipl("rr", "Rajasthan Royals", "RR", ["rajasthan royals", "राजस्थान रॉयल्स"]),
  ipl("gt", "Gujarat Titans", "GT", ["gujarat titans", "गुजरात टाइटंस"]),
  ipl("lsg", "Lucknow Super Giants", "LSG", ["lsg", "lucknow super giants", "लखनऊ सुपर जायंट्स"]),
  // Football — clubs (names as fixture providers write them are covered by aliases)
  club("arsenal", "Arsenal", "ARS", ["arsenal", "arsenal fc", "~gunners", "आर्सेनल"]),
  club("chelsea", "Chelsea", "CHE", ["~chelsea", "chelsea fc", "चेल्सी"]),
  club("liverpool", "Liverpool", "LIV", ["~liverpool", "liverpool fc", "लिवरपूल"]),
  club("mancity", "Manchester City", "MCI", ["manchester city", "manchester city fc", "man city", "mancity", "मैनचेस्टर सिटी"]),
  club("manutd", "Manchester United", "MUN", ["manchester united", "manchester united fc", "man united", "man utd", "manutd", "मैनचेस्टर यूनाइटेड"]),
  club("tottenham", "Tottenham Hotspur", "TOT", ["tottenham", "tottenham hotspur", "tottenham hotspur fc", "~spurs"]),
  club("newcastle", "Newcastle United", "NEW", ["~newcastle", "newcastle united", "newcastle united fc"]),
  club("astonvilla", "Aston Villa", "AVL", ["aston villa", "aston villa fc"]),
  club("bournemouth", "AFC Bournemouth", "BOU", ["bournemouth", "afc bournemouth"]),
  club("brentford", "Brentford", "BRE", ["brentford", "brentford fc"]),
  club("brighton", "Brighton & Hove Albion", "BHA", ["brighton", "brighton & hove albion", "brighton and hove albion", "brighton hove albion fc"]),
  club("coventry", "Coventry City", "COV", ["coventry", "coventry city", "coventry city fc"]),
  club("crystalpalace", "Crystal Palace", "CRY", ["crystal palace", "crystal palace fc"]),
  club("everton", "Everton", "EVE", ["everton", "everton fc"]),
  club("fulham", "Fulham", "FUL", ["fulham", "fulham fc"]),
  club("hull", "Hull City", "HUL", ["hull city", "hull city afc"]),
  club("ipswich", "Ipswich Town", "IPS", ["ipswich", "ipswich town", "ipswich town fc"]),
  club("leeds", "Leeds United", "LEE", ["leeds", "leeds united", "leeds united fc"]),
  club("nottmforest", "Nottingham Forest", "NFO", ["nottingham forest", "nottingham forest fc", "~forest"]),
  club("sunderland", "Sunderland", "SUN", ["sunderland", "sunderland afc"]),
  club("realmadrid", "Real Madrid", "RMA", ["real madrid", "real madrid cf", "रियल मैड्रिड"]),
  club("barcelona", "Barcelona", "BAR", ["barcelona", "fc barcelona", "barca", "barça", "बार्सिलोना"]),
  club("atletico", "Atlético Madrid", "ATM", ["atletico madrid", "atlético madrid", "club atlético de madrid", "~atletico"]),
  club("bayern", "Bayern Munich", "BAY", ["bayern", "bayern munich", "fc bayern münchen", "bayern münchen"]),
  club("dortmund", "Borussia Dortmund", "BVB", ["dortmund", "borussia dortmund", "bvb"]),
  club("juventus", "Juventus", "JUV", ["juventus", "juventus fc", "~juve"]),
  club("inter", "Inter Milan", "INT", ["inter milan", "~inter", "fc internazionale milano", "internazionale"]),
  club("acmilan", "AC Milan", "MIL", ["ac milan", "~milan"]),
  club("psg", "Paris Saint-Germain", "PSG", ["psg", "paris saint-germain", "paris saint germain", "paris saint-germain fc"]),
  club("mohunbagan", "Mohun Bagan Super Giant", "MBSG", ["mohun bagan", "mohun bagan super giant", "मोहन बागान"]),
  club("eastbengal", "East Bengal", "EB", ["east bengal", "ईस्ट बंगाल"]),
  club("keralablasters", "Kerala Blasters", "KBFC", ["kerala blasters"]),
  club("bengalurufc", "Bengaluru FC", "BFC", ["bengaluru fc"]),
  club("mumbaicity", "Mumbai City FC", "MCFC", ["mumbai city", "mumbai city fc"]),
  // Football — national teams
  fnat("ind", "India", "IND", ["india football", "blue tigers"]),
  fnat("arg", "Argentina", "ARG", ["~argentina", "~अर्जेंटीना"]),
  fnat("bra", "Brazil", "BRA", ["~brazil", "~brasil", "~ब्राज़ील", "~ब्राजील"]),
  fnat("por", "Portugal", "POR", ["~portugal", "~पुर्तगाल"]),
  fnat("fra", "France", "FRA", ["~france", "~फ्रांस"]),
  fnat("esp", "Spain", "ESP", ["~spain", "~स्पेन"]),
  fnat("ger", "Germany", "GER", ["~germany", "~जर्मनी"]),
];

export const PLAYERS: Player[] = [
  { id: "kohli", sport: "cricket", name: "Virat Kohli", aliases: ["virat kohli", "kohli", "~virat", "king kohli", "विराट कोहली", "कोहली", "~विराट"] },
  { id: "rohit", sport: "cricket", name: "Rohit Sharma", aliases: ["rohit sharma", "~rohit", "hitman", "रोहित शर्मा", "~रोहित"] },
  { id: "bumrah", sport: "cricket", name: "Jasprit Bumrah", aliases: ["jasprit bumrah", "bumrah", "बुमराह"] },
  { id: "gill", sport: "cricket", name: "Shubman Gill", aliases: ["shubman gill", "~gill", "शुभमन गिल"] },
  { id: "dhoni", sport: "cricket", name: "MS Dhoni", aliases: ["ms dhoni", "dhoni", "~mahi", "thala", "धोनी"] },
  { id: "hardik", sport: "cricket", name: "Hardik Pandya", aliases: ["hardik pandya", "~hardik", "हार्दिक पांड्या"] },
  { id: "jadeja", sport: "cricket", name: "Ravindra Jadeja", aliases: ["ravindra jadeja", "jadeja", "jaddu", "जडेजा"] },
  { id: "pant", sport: "cricket", name: "Rishabh Pant", aliases: ["rishabh pant", "~pant", "ऋषभ पंत"] },
  { id: "surya", sport: "cricket", name: "Suryakumar Yadav", aliases: ["suryakumar yadav", "suryakumar", "~sky", "सूर्यकुमार"] },
  { id: "smriti", sport: "cricket", name: "Smriti Mandhana", aliases: ["smriti mandhana", "mandhana", "स्मृति मंधाना"] },
  { id: "harmanpreet", sport: "cricket", name: "Harmanpreet Kaur", aliases: ["harmanpreet kaur", "harmanpreet", "हरमनप्रीत"] },
  { id: "babar", sport: "cricket", name: "Babar Azam", aliases: ["babar azam", "~babar"] },
  { id: "cummins", sport: "cricket", name: "Pat Cummins", aliases: ["pat cummins", "cummins"] },
  { id: "messi", sport: "football", name: "Lionel Messi", aliases: ["lionel messi", "~messi", "मेसी"] },
  { id: "ronaldo", sport: "football", name: "Cristiano Ronaldo", aliases: ["cristiano ronaldo", "ronaldo", "cr7", "रोनाल्डो"] },
  { id: "mbappe", sport: "football", name: "Kylian Mbappé", aliases: ["kylian mbappe", "mbappe", "mbappé", "एम्बाप्पे"] },
  { id: "haaland", sport: "football", name: "Erling Haaland", aliases: ["erling haaland", "haaland"] },
  { id: "salah", sport: "football", name: "Mohamed Salah", aliases: ["mohamed salah", "~salah"] },
  { id: "chhetri", sport: "football", name: "Sunil Chhetri", aliases: ["sunil chhetri", "chhetri", "सुनील छेत्री"] },
];

export const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));

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

/**
 * Finds a team id for a provider's team name (e.g. "Arsenal FC" → football:arsenal).
 * Exact alias match only — provider names are never fuzzy-guessed.
 */
export function teamIdForName(name: string, sport: Sport): string | null {
  const n = normalizeName(name);
  for (const t of TEAMS) {
    if (t.sport !== sport) continue;
    if (normalizeName(t.name) === n || t.aliases.some((a) => normalizeName(a.replace(/^~/, "")) === n)) return t.id;
  }
  return null;
}
