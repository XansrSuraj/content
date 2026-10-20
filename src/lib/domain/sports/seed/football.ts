import type { AmbiguousAlias, CompetitionSeed, PlayerSeed, TeamSeed } from "./types";

const club = (id: string, name: string, short: string, comp: string, aliases: string[]): TeamSeed => ({
  id: `football:${id}`, sport: "football", name, short, kind: "club", category: "men", competitions: [comp], aliases,
});
const nat = (id: string, name: string, short: string, aliases: string[]): TeamSeed => ({
  id: `football:${id}`, sport: "football", name, short, kind: "national", category: "men", competitions: ["football:wc"], aliases,
});

export const FOOTBALL_COMPETITIONS: CompetitionSeed[] = [
  { id: "football:pl", sport: "football", name: "Premier League", format: "league", category: "men", aliases: ["premier league", "epl", "प्रीमियर लीग"] },
  { id: "football:laliga", sport: "football", name: "LaLiga", format: "league", category: "men", aliases: ["la liga", "laliga", "spanish league"] },
  { id: "football:ucl", sport: "football", name: "UEFA Champions League", format: "cup", category: "men", aliases: ["champions league", "ucl", "uefa champions league", "चैंपियंस लीग"] },
  { id: "football:bundesliga", sport: "football", name: "Bundesliga", format: "league", category: "men", aliases: ["bundesliga"] },
  { id: "football:seriea", sport: "football", name: "Serie A", format: "league", category: "men", aliases: ["serie a"] },
  { id: "football:ligue1", sport: "football", name: "Ligue 1", format: "league", category: "men", aliases: ["ligue 1"] },
  { id: "football:isl", sport: "football", name: "Indian Super League", format: "league", category: "men", aliases: ["isl", "indian super league", "इंडियन सुपर लीग"] },
  { id: "football:wc", sport: "football", name: "FIFA World Cup", format: "cup", category: "men", aliases: ["fifa world cup", "fifa wc"] },
  { id: "football:euro", sport: "football", name: "UEFA European Championship", format: "cup", category: "men", aliases: ["euro cup", "euros", "uefa euro"] },
];

export const FOOTBALL_TEAMS: TeamSeed[] = [
  // Premier League (every 2026/27 club, so fixtures resolve)
  club("arsenal", "Arsenal", "ARS", "football:pl", ["arsenal", "arsenal fc", "afc arsenal", "आर्सेनल", "~gunners"]),
  club("astonvilla", "Aston Villa", "AVL", "football:pl", ["aston villa", "aston villa fc", "~villa"]),
  club("bournemouth", "AFC Bournemouth", "BOU", "football:pl", ["bournemouth", "afc bournemouth"]),
  club("brentford", "Brentford", "BRE", "football:pl", ["brentford", "brentford fc"]),
  club("brighton", "Brighton & Hove Albion", "BHA", "football:pl", ["brighton", "brighton & hove albion", "brighton and hove albion", "brighton hove albion"]),
  club("chelsea", "Chelsea", "CHE", "football:pl", ["chelsea fc", "चेल्सी", "~chelsea", "~blues"]),
  club("coventry", "Coventry City", "COV", "football:pl", ["coventry", "coventry city"]),
  club("crystalpalace", "Crystal Palace", "CRY", "football:pl", ["crystal palace"]),
  club("everton", "Everton", "EVE", "football:pl", ["everton", "everton fc"]),
  club("fulham", "Fulham", "FUL", "football:pl", ["fulham", "fulham fc"]),
  club("hull", "Hull City", "HUL", "football:pl", ["hull city", "hull city afc"]),
  club("ipswich", "Ipswich Town", "IPS", "football:pl", ["ipswich", "ipswich town"]),
  club("leeds", "Leeds United", "LEE", "football:pl", ["leeds", "leeds united"]),
  club("liverpool", "Liverpool", "LIV", "football:pl", ["liverpool fc", "lfc", "the reds", "लिवरपूल", "~liverpool"]),
  club("mancity", "Manchester City", "MCI", "football:pl", ["manchester city", "man city", "mancity", "mcfc", "cityzens", "मैनचेस्टर सिटी"]),
  club("manutd", "Manchester United", "MUN", "football:pl", ["manchester united", "man united", "man utd", "man u", "manutd", "mufc", "red devils", "मैनचेस्टर यूनाइटेड"]),
  club("newcastle", "Newcastle United", "NEW", "football:pl", ["newcastle united", "nufc", "magpies", "~newcastle"]),
  club("nottmforest", "Nottingham Forest", "NFO", "football:pl", ["nottingham forest", "nottm forest", "~forest"]),
  club("sunderland", "Sunderland", "SUN", "football:pl", ["sunderland", "sunderland afc"]),
  club("tottenham", "Tottenham Hotspur", "TOT", "football:pl", ["tottenham", "tottenham hotspur", "spurs", "thfc"]),
  club("westham", "West Ham United", "WHU", "football:pl", ["west ham", "west ham united", "hammers"]),
  // LaLiga
  club("realmadrid", "Real Madrid", "RMA", "football:laliga", ["real madrid", "real madrid cf", "los blancos", "रियल मैड्रिड"]),
  club("barcelona", "Barcelona", "BAR", "football:laliga", ["barcelona", "fc barcelona", "barca", "barça", "बार्सिलोना"]),
  club("atletico", "Atlético Madrid", "ATM", "football:laliga", ["atletico madrid", "atlético madrid", "atletico de madrid", "atleti", "~atletico"]),
  club("realsociedad", "Real Sociedad", "RSO", "football:laliga", ["real sociedad"]),
  club("realbetis", "Real Betis", "BET", "football:laliga", ["real betis", "betis"]),
  club("sevilla", "Sevilla", "SEV", "football:laliga", ["sevilla", "sevilla fc", "fc sevilla"]),
  club("villarreal", "Villarreal", "VIL", "football:laliga", ["villarreal"]),
  // Elsewhere in Europe
  club("bayern", "Bayern Munich", "BAY", "football:bundesliga", ["bayern", "bayern munich", "bayern münchen", "fc bayern"]),
  club("dortmund", "Borussia Dortmund", "BVB", "football:bundesliga", ["dortmund", "borussia dortmund", "bvb"]),
  club("leverkusen", "Bayer Leverkusen", "B04", "football:bundesliga", ["leverkusen", "bayer leverkusen"]),
  club("juventus", "Juventus", "JUV", "football:seriea", ["juventus", "juve"]),
  club("inter", "Inter Milan", "INT", "football:seriea", ["inter milan", "internazionale", "~inter"]),
  club("acmilan", "AC Milan", "MIL", "football:seriea", ["ac milan", "~milan"]),
  club("napoli", "Napoli", "NAP", "football:seriea", ["napoli", "ssc napoli"]),
  club("psg", "Paris Saint-Germain", "PSG", "football:ligue1", ["psg", "paris saint-germain", "paris saint germain"]),
  club("benfica", "Benfica", "BEN", "football:ucl", ["benfica"]),
  club("alnassr", "Al Nassr", "NAS", "football:other", ["al nassr", "al-nassr"]),
  club("intermiami", "Inter Miami", "MIA", "football:other", ["inter miami"]),
  // ISL
  club("mohunbagan", "Mohun Bagan Super Giant", "MBSG", "football:isl", ["mohun bagan", "mohun bagan super giant", "मोहन बागान"]),
  club("eastbengal", "East Bengal", "EB", "football:isl", ["east bengal", "ईस्ट बंगाल"]),
  club("keralablasters", "Kerala Blasters", "KBFC", "football:isl", ["kerala blasters", "kbfc"]),
  club("bengalurufc", "Bengaluru FC", "BFC", "football:isl", ["bengaluru fc"]),
  club("mumbaicity", "Mumbai City FC", "MCFC", "football:isl", ["mumbai city fc", "mumbai city"]),
  club("fcgoa", "FC Goa", "FCG", "football:isl", ["fc goa"]),
  // National teams
  nat("ind", "India", "IND", ["india football team", "blue tigers", "indian football team"]),
  nat("arg", "Argentina", "ARG", ["albiceleste", "~argentina", "~अर्जेंटीना"]),
  nat("bra", "Brazil", "BRA", ["selecao", "seleção", "~brazil", "~brasil", "~ब्राज़ील", "~ब्राजील"]),
  nat("por", "Portugal", "POR", ["~portugal", "~पुर्तगाल"]),
  nat("fra", "France", "FRA", ["les bleus", "~france", "~फ्रांस"]),
  nat("esp", "Spain", "ESP", ["la roja", "~spain", "~स्पेन"]),
  nat("ger", "Germany", "GER", ["die mannschaft", "~germany", "~जर्मनी"]),
  nat("eng", "England", "ENG", ["three lions"]),
];

export const FOOTBALL_PLAYERS: PlayerSeed[] = [
  { id: "messi", sport: "football", name: "Lionel Messi", category: "men", aliases: ["lionel messi", "leo messi", "messi", "मेसी", "goat messi"] },
  { id: "cr7", sport: "football", name: "Cristiano Ronaldo", category: "men", aliases: ["cristiano ronaldo", "cristiano", "cr7", "siuu", "siuuu"] },
  { id: "r9", sport: "football", name: "Ronaldo Nazário", category: "men", aliases: ["ronaldo nazario", "ronaldo nazário", "r9", "o fenomeno", "o fenômeno"] },
  { id: "mbappe", sport: "football", name: "Kylian Mbappé", category: "men", aliases: ["kylian mbappe", "kylian mbappé", "mbappe", "mbappé", "एम्बाप्पे"] },
  { id: "haaland", sport: "football", name: "Erling Haaland", category: "men", aliases: ["erling haaland", "haaland"] },
  { id: "salah", sport: "football", name: "Mohamed Salah", category: "men", aliases: ["mohamed salah", "mo salah", "~salah"] },
  { id: "neymar", sport: "football", name: "Neymar", category: "men", aliases: ["neymar", "neymar jr"] },
  { id: "kane", sport: "football", name: "Harry Kane", category: "men", aliases: ["harry kane"] },
  { id: "bellingham", sport: "football", name: "Jude Bellingham", category: "men", aliases: ["jude bellingham", "bellingham"] },
  { id: "vinicius", sport: "football", name: "Vinícius Júnior", category: "men", aliases: ["vinicius junior", "vinícius júnior", "vini jr", "vinicius"] },
  { id: "yamal", sport: "football", name: "Lamine Yamal", category: "men", aliases: ["lamine yamal", "yamal"] },
  { id: "saka", sport: "football", name: "Bukayo Saka", category: "men", aliases: ["bukayo saka", "saka"] },
  { id: "chhetri", sport: "football", name: "Sunil Chhetri", category: "men", aliases: ["sunil chhetri", "chhetri", "सुनील छेत्री"] },
];

export const FOOTBALL_AMBIGUOUS: AmbiguousAlias[] = [
  {
    alias: "united",
    sport: "football",
    kind: "team",
    candidates: ["football:manutd", "football:newcastle", "football:westham", "football:leeds"],
    context: {
      "football:manutd": ["old trafford", "red devils", "ten hag", "amorim", "bruno fernandes", "manchester"],
      "football:newcastle": ["st james", "magpies", "toon", "newcastle"],
      "football:westham": ["london stadium", "hammers", "west ham"],
      "football:leeds": ["elland road", "leeds"],
    },
  },
  {
    alias: "city",
    sport: "football",
    kind: "team",
    candidates: ["football:mancity", "football:coventry", "football:hull"],
    context: { "football:mancity": ["etihad", "guardiola", "pep", "haaland", "manchester"], "football:coventry": ["coventry"], "football:hull": ["hull"] },
  },
  {
    alias: "real",
    sport: "football",
    kind: "team",
    candidates: ["football:realmadrid", "football:realsociedad", "football:realbetis"],
    context: { "football:realmadrid": ["madrid", "bernabeu", "bernabéu", "vinicius", "mbappe", "bellingham", "el clasico", "clasico"], "football:realsociedad": ["sociedad", "san sebastian"], "football:realbetis": ["betis", "seville"] },
  },
  {
    alias: "ronaldo",
    sport: "football",
    kind: "player",
    candidates: ["cr7", "r9"],
    context: {
      cr7: ["cr7", "siuu", "al nassr", "portugal", "juventus", "manchester united", "man utd", "euro"],
      r9: ["r9", "nazario", "nazário", "brazil", "brasil", "2002", "fenomeno", "fenômeno", "inter 1997"],
    },
  },
];
