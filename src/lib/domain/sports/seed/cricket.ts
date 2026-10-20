import type { AmbiguousAlias, CompetitionSeed, PlayerSeed, TeamSeed } from "./types";

const nat = (id: string, name: string, short: string, aliases: string[]): TeamSeed => ({
  id: `cricket:${id}`, sport: "cricket", name, short, kind: "national", category: "men", competitions: ["intl"], aliases,
});
const natW = (id: string, name: string, short: string, aliases: string[]): TeamSeed => ({
  id: `cricket:${id}_w`, sport: "cricket", name: `${name} Women`, short: `${short}-W`, kind: "national", category: "women", competitions: ["intl_w"], aliases,
});
const fr = (id: string, name: string, short: string, comp: string, aliases: string[], category: "men" | "women" = "men"): TeamSeed => ({
  id: `cricket:${id}`, sport: "cricket", name, short, kind: "franchise", category, competitions: [comp], aliases,
});

export const CRICKET_COMPETITIONS: CompetitionSeed[] = [
  { id: "cricket:ipl", sport: "cricket", name: "Indian Premier League", format: "t20", category: "men", aliases: ["ipl", "indian premier league", "आईपीएल", "tata ipl"] },
  { id: "cricket:wpl", sport: "cricket", name: "Women's Premier League", format: "t20", category: "women", aliases: ["wpl", "women's premier league", "womens premier league", "डब्ल्यूपीएल"] },
  { id: "cricket:intl", sport: "cricket", name: "International cricket (men)", format: "multi", category: "men", aliases: ["t20i", "odi", "test match", "test series", "bilateral series"] },
  { id: "cricket:intl_w", sport: "cricket", name: "International cricket (women)", format: "multi", category: "women", aliases: ["women's t20i", "women's odi"] },
  { id: "cricket:wc", sport: "cricket", name: "ICC World Cup", format: "multi", category: "men", aliases: ["world cup", "वर्ल्ड कप", "विश्व कप", "t20 world cup", "odi world cup"] },
  { id: "cricket:wc_w", sport: "cricket", name: "ICC Women's World Cup", format: "multi", category: "women", aliases: ["women's world cup", "womens world cup"] },
  { id: "cricket:asiacup", sport: "cricket", name: "Asia Cup", format: "multi", category: "men", aliases: ["asia cup", "एशिया कप"] },
  { id: "cricket:ct", sport: "cricket", name: "ICC Champions Trophy", format: "odi", category: "men", aliases: ["champions trophy"] },
  { id: "cricket:wtc", sport: "cricket", name: "World Test Championship", format: "test", category: "men", aliases: ["wtc", "world test championship"] },
  { id: "cricket:ranji", sport: "cricket", name: "Ranji Trophy", format: "test", category: "men", aliases: ["ranji", "ranji trophy", "रणजी"] },
  { id: "cricket:ilt20", sport: "cricket", name: "ILT20", format: "t20", category: "men", aliases: ["ilt20", "international league t20"] },
  { id: "cricket:sa20", sport: "cricket", name: "SA20", format: "t20", category: "men", aliases: ["sa20"] },
  { id: "cricket:mlc", sport: "cricket", name: "Major League Cricket", format: "t20", category: "men", aliases: ["mlc", "major league cricket"] },
];

export const CRICKET_TEAMS: TeamSeed[] = [
  // Men's national teams
  nat("ind", "India", "IND", ["team india", "men in blue", "टीम इंडिया", "~india", "~bharat", "~भारत", "~इंडिया", "~ind"]),
  nat("aus", "Australia", "AUS", ["aussies", "~kangaroos", "~australia", "~ऑस्ट्रेलिया", "~आस्ट्रेलिया", "~aus"]),
  nat("eng", "England", "ENG", ["three lions cricket", "~england", "~इंग्लैंड", "~eng"]),
  nat("pak", "Pakistan", "PAK", ["men in green", "shaheens", "~pakistan", "~पाकिस्तान", "~pak"]),
  nat("sa", "South Africa", "SA", ["proteas", "~south africa", "~दक्षिण अफ्रीका", "~साउथ अफ्रीका", "~rsa"]),
  nat("nz", "New Zealand", "NZ", ["black caps", "blackcaps", "~kiwis", "~new zealand", "~न्यूजीलैंड", "~न्यूज़ीलैंड"]),
  nat("sl", "Sri Lanka", "SL", ["~sri lanka", "~श्रीलंका"]),
  nat("ban", "Bangladesh", "BAN", ["tigers bangladesh", "~bangladesh", "~बांग्लादेश"]),
  nat("afg", "Afghanistan", "AFG", ["~afghanistan", "~अफगानिस्तान", "~अफ़ग़ानिस्तान"]),
  nat("wi", "West Indies", "WI", ["windies", "~west indies", "~वेस्टइंडीज", "~वेस्ट इंडीज"]),
  nat("ire", "Ireland", "IRE", ["~ireland"]),
  nat("zim", "Zimbabwe", "ZIM", ["~zimbabwe", "~जिम्बाब्वे"]),
  nat("ned", "Netherlands", "NED", ["~netherlands"]),
  nat("nep", "Nepal", "NEP", ["~nepal", "~नेपाल"]),
  // Women's national teams (picked when the caption says women/mahila/WPL…)
  natW("ind", "India", "IND", ["team india women", "women in blue", "भारतीय महिला टीम"]),
  natW("aus", "Australia", "AUS", ["southern stars"]),
  natW("eng", "England", "ENG", []),
  natW("sa", "South Africa", "SA", []),
  natW("nz", "New Zealand", "NZ", ["white ferns"]),
  natW("pak", "Pakistan", "PAK", []),
  natW("sl", "Sri Lanka", "SL", []),
  // IPL
  fr("csk", "Chennai Super Kings", "CSK", "cricket:ipl", ["csk", "chennai super kings", "चेन्नई सुपर किंग्स", "सीएसके", "yellove", "~chennai"]),
  fr("mi", "Mumbai Indians", "MI", "cricket:ipl", ["mumbai indians", "मुंबई इंडियंस", "~paltan", "~पलटन"]),
  fr("rcb", "Royal Challengers Bengaluru", "RCB", "cricket:ipl", ["rcb", "royal challengers bengaluru", "royal challengers bangalore", "आरसीबी", "रॉयल चैलेंजर्स", "ee sala cup namde", "~bengaluru", "~bangalore"]),
  fr("kkr", "Kolkata Knight Riders", "KKR", "cricket:ipl", ["kkr", "kolkata knight riders", "केकेआर", "कोलकाता नाइट राइडर्स", "~kolkata"]),
  fr("srh", "Sunrisers Hyderabad", "SRH", "cricket:ipl", ["srh", "sunrisers hyderabad", "sunrisers", "सनराइजर्स हैदराबाद", "orange army", "~hyderabad"]),
  fr("dc", "Delhi Capitals", "DC", "cricket:ipl", ["delhi capitals", "दिल्ली कैपिटल्स", "~dc"]),
  fr("pbks", "Punjab Kings", "PBKS", "cricket:ipl", ["pbks", "punjab kings", "पंजाब किंग्स"]),
  fr("rr", "Rajasthan Royals", "RR", "cricket:ipl", ["rajasthan royals", "राजस्थान रॉयल्स", "~rr"]),
  fr("gt", "Gujarat Titans", "GT", "cricket:ipl", ["gujarat titans", "गुजरात टाइटंस", "~gt"]),
  fr("lsg", "Lucknow Super Giants", "LSG", "cricket:ipl", ["lsg", "lucknow super giants", "लखनऊ सुपर जायंट्स"]),
  // WPL
  fr("mi_w", "Mumbai Indians Women", "MI-W", "cricket:wpl", ["mumbai indians women", "mi women"], "women"),
  fr("rcb_w", "Royal Challengers Bengaluru Women", "RCB-W", "cricket:wpl", ["rcb women", "royal challengers bengaluru women"], "women"),
  fr("dc_w", "Delhi Capitals Women", "DC-W", "cricket:wpl", ["delhi capitals women", "dc women"], "women"),
  fr("gg_w", "Gujarat Giants", "GG", "cricket:wpl", ["gujarat giants"], "women"),
  fr("upw_w", "UP Warriorz", "UPW", "cricket:wpl", ["up warriorz", "up warriors", "upw"], "women"),
  // MI sister franchises (why plain "MI" is ambiguous)
  fr("mi_emirates", "MI Emirates", "MIE", "cricket:ilt20", ["mi emirates"]),
  fr("mi_capetown", "MI Cape Town", "MICT", "cricket:sa20", ["mi cape town", "mi capetown"]),
  fr("mi_newyork", "MI New York", "MINY", "cricket:mlc", ["mi new york", "mi ny"]),
];

export const CRICKET_PLAYERS: PlayerSeed[] = [
  { id: "kohli", sport: "cricket", name: "Virat Kohli", category: "men", aliases: ["virat kohli", "kohli", "king kohli", "virat bhai", "chiku", "विराट कोहली", "कोहली", "~virat", "~विराट"] },
  { id: "rohit", sport: "cricket", name: "Rohit Sharma", category: "men", aliases: ["rohit sharma", "hitman", "ro hit", "रोहित शर्मा", "~rohit", "~रोहित"] },
  { id: "dhoni", sport: "cricket", name: "MS Dhoni", category: "men", aliases: ["ms dhoni", "dhoni", "thala", "captain cool", "धोनी", "माही", "~mahi"] },
  { id: "bumrah", sport: "cricket", name: "Jasprit Bumrah", category: "men", aliases: ["jasprit bumrah", "bumrah", "boom boom bumrah", "बुमराह"] },
  { id: "gill", sport: "cricket", name: "Shubman Gill", category: "men", aliases: ["shubman gill", "shubman", "शुभमन गिल", "~gill"] },
  { id: "hardik", sport: "cricket", name: "Hardik Pandya", category: "men", aliases: ["hardik pandya", "हार्दिक पांड्या", "~hardik"] },
  { id: "jadeja", sport: "cricket", name: "Ravindra Jadeja", category: "men", aliases: ["ravindra jadeja", "jadeja", "jaddu", "sir jadeja", "जडेजा"] },
  { id: "pant", sport: "cricket", name: "Rishabh Pant", category: "men", aliases: ["rishabh pant", "ऋषभ पंत", "~pant"] },
  { id: "surya", sport: "cricket", name: "Suryakumar Yadav", category: "men", aliases: ["suryakumar yadav", "suryakumar", "surya dada", "सूर्यकुमार", "~sky"] },
  { id: "klrahul", sport: "cricket", name: "KL Rahul", category: "men", aliases: ["kl rahul", "केएल राहुल", "~rahul"] },
  { id: "jaiswal", sport: "cricket", name: "Yashasvi Jaiswal", category: "men", aliases: ["yashasvi jaiswal", "jaiswal", "यशस्वी जायसवाल"] },
  { id: "abhishek", sport: "cricket", name: "Abhishek Sharma", category: "men", aliases: ["abhishek sharma"] },
  { id: "rinku", sport: "cricket", name: "Rinku Singh", category: "men", aliases: ["rinku singh", "rinku", "रिंकू सिंह"] },
  { id: "siraj", sport: "cricket", name: "Mohammed Siraj", category: "men", aliases: ["mohammed siraj", "siraj", "सिराज"] },
  { id: "shami", sport: "cricket", name: "Mohammed Shami", category: "men", aliases: ["mohammed shami", "shami", "शमी"] },
  { id: "kuldeep", sport: "cricket", name: "Kuldeep Yadav", category: "men", aliases: ["kuldeep yadav", "kuldeep"] },
  { id: "axar", sport: "cricket", name: "Axar Patel", category: "men", aliases: ["axar patel", "axar"] },
  { id: "ashwin", sport: "cricket", name: "R Ashwin", category: "men", aliases: ["ravichandran ashwin", "ashwin", "अश्विन"] },
  { id: "shreyas", sport: "cricket", name: "Shreyas Iyer", category: "men", aliases: ["shreyas iyer", "shreyas"] },
  { id: "sachin", sport: "cricket", name: "Sachin Tendulkar", category: "men", aliases: ["sachin tendulkar", "sachin", "master blaster", "सचिन"] },
  { id: "smriti", sport: "cricket", name: "Smriti Mandhana", category: "women", aliases: ["smriti mandhana", "mandhana", "स्मृति मंधाना"] },
  { id: "harmanpreet", sport: "cricket", name: "Harmanpreet Kaur", category: "women", aliases: ["harmanpreet kaur", "harmanpreet", "हरमनप्रीत"] },
  { id: "jemimah", sport: "cricket", name: "Jemimah Rodrigues", category: "women", aliases: ["jemimah rodrigues", "jemimah"] },
  { id: "shafali", sport: "cricket", name: "Shafali Verma", category: "women", aliases: ["shafali verma", "shafali"] },
  { id: "richa", sport: "cricket", name: "Richa Ghosh", category: "women", aliases: ["richa ghosh"] },
  { id: "deepti", sport: "cricket", name: "Deepti Sharma", category: "women", aliases: ["deepti sharma"] },
  { id: "babar", sport: "cricket", name: "Babar Azam", category: "men", aliases: ["babar azam", "~babar"] },
  { id: "shaheen", sport: "cricket", name: "Shaheen Afridi", category: "men", aliases: ["shaheen afridi", "shaheen shah afridi"] },
  { id: "rizwan", sport: "cricket", name: "Mohammad Rizwan", category: "men", aliases: ["mohammad rizwan", "rizwan"] },
  { id: "cummins", sport: "cricket", name: "Pat Cummins", category: "men", aliases: ["pat cummins", "cummins"] },
  { id: "head", sport: "cricket", name: "Travis Head", category: "men", aliases: ["travis head"] },
  { id: "starc", sport: "cricket", name: "Mitchell Starc", category: "men", aliases: ["mitchell starc", "starc"] },
  { id: "smith", sport: "cricket", name: "Steve Smith", category: "men", aliases: ["steve smith"] },
  { id: "root", sport: "cricket", name: "Joe Root", category: "men", aliases: ["joe root"] },
  { id: "stokes", sport: "cricket", name: "Ben Stokes", category: "men", aliases: ["ben stokes", "stokes"] },
  { id: "buttler", sport: "cricket", name: "Jos Buttler", category: "men", aliases: ["jos buttler", "buttler"] },
  { id: "williamson", sport: "cricket", name: "Kane Williamson", category: "men", aliases: ["kane williamson", "williamson"] },
  { id: "rashid", sport: "cricket", name: "Rashid Khan", category: "men", aliases: ["rashid khan"] },
  { id: "abd", sport: "cricket", name: "AB de Villiers", category: "men", aliases: ["ab de villiers", "abd", "mr 360"] },
];

export const CRICKET_AMBIGUOUS: AmbiguousAlias[] = [
  {
    alias: "mi",
    sport: "cricket",
    kind: "team",
    candidates: ["cricket:mi", "cricket:mi_w", "cricket:mi_emirates", "cricket:mi_capetown", "cricket:mi_newyork"],
    context: {
      "cricket:mi": ["ipl", "wankhede", "rohit", "hardik", "bumrah", "paltan", "आईपीएल"],
      "cricket:mi_w": ["wpl", "women", "harmanpreet", "mahila"],
      "cricket:mi_emirates": ["ilt20", "emirates", "dubai", "abu dhabi"],
      "cricket:mi_capetown": ["sa20", "cape town", "newlands"],
      "cricket:mi_newyork": ["mlc", "new york", "major league cricket"],
    },
  },
  {
    alias: "king",
    sport: "cricket",
    kind: "player",
    candidates: ["kohli", "babar"],
    context: { kohli: ["rcb", "india", "virat", "चेस", "chase master"], babar: ["pakistan", "babar"] },
  },
];
