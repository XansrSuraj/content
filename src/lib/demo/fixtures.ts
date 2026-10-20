import type { CaptionResult } from "@/lib/domain/captions";
import type { CreativeAngle } from "@/lib/db/schema";

/**
 * Deterministic demo content. Topics are deliberately generic (no real people,
 * prices, or news events) so nothing here can be mistaken for a real claim.
 * Demo observations are labeled "Demo sample data" everywhere they appear.
 */

export interface DemoOpportunity {
  id: string;
  title: string;
  kind: "topic" | "person" | "event" | "idea";
  group: "timely" | "plan" | "evergreen";
  categories: string[];
  languages: string[];
  regions: string[];
  platforms: string[];
  summary: string;
  fitReason: string;
  angles: CreativeAngle[];
  effort: "low" | "medium" | "high";
  suggestedHashtags: string[];
  sensitivityNote?: string;
  /** Demo observations: hours before seed time, with demo ranks. */
  observations: { hoursAgo: number; rank: number; platform: string; hashtags: string[] }[];
}

const ALL_SHORT = ["instagram_reels", "youtube_shorts", "facebook_reels"];

export const DEMO_OPPORTUNITIES: DemoOpportunity[] = [
  {
    id: "demo-opp-budget-phone-camera",
    title: "Budget phone se cinematic shots",
    kind: "topic",
    group: "timely",
    categories: ["tech"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Phone camera tricks that make everyday footage look planned: light, stability, and movement.",
    fitReason: "Tech creators can show real before/after clips from their own phone — no expensive gear needed.",
    angles: [
      { title: "Same phone, 3 settings", description: "Ek hi scene teen baar shoot karo: default, exposure lock, slow pan. Viewer khud farak dekhe." },
      { title: "₹0 gear challenge", description: "Sirf ghar ki cheezein: khidki ki light, books ka stand, dupatta diffuser." },
      { title: "Galti vs sahi", description: "Common mistakes (backlight, zoom) aur unka simple fix, split-screen mein." },
    ],
    effort: "low",
    suggestedHashtags: ["#MobileFilmmaking", "#PhoneCinematography", "#BudgetPhone", "#TechHindi"],
    observations: [
      { hoursAgo: 30, rank: 14, platform: "youtube", hashtags: ["#MobileFilmmaking", "#TechHindi"] },
      { hoursAgo: 6, rank: 6, platform: "youtube", hashtags: ["#MobileFilmmaking", "#BudgetPhone"] },
    ],
  },
  {
    id: "demo-opp-exam-routine",
    title: "Exam season: realistic study routine",
    kind: "event",
    group: "plan",
    categories: ["education", "lifestyle"],
    languages: ["hinglish", "hindi"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Students look for routines that fit real life — tuition, travel, family duties — not 5 AM fantasy timetables.",
    fitReason: "Educators can share a routine they actually tested, with honest trade-offs.",
    angles: [
      { title: "Mera real timetable", description: "Ek din ka honest timelapse: kahan time waste hua, kya kaam aaya." },
      { title: "Revision ka 3-step system", description: "Simple framework jo kisi bhi subject pe lage, ek example ke saath." },
      { title: "Parents vs students", description: "Light skit: 'beta padh raha hai?' — phir ek useful tip." },
    ],
    effort: "medium",
    suggestedHashtags: ["#StudyRoutine", "#ExamTips", "#PadhaiKaro"],
    observations: [{ hoursAgo: 20, rank: 22, platform: "youtube", hashtags: ["#StudyRoutine"] }],
  },
  {
    id: "demo-opp-office-monday",
    title: "Office ki Monday meeting (relatable comedy)",
    kind: "idea",
    group: "evergreen",
    categories: ["comedy"],
    languages: ["hinglish"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "Workplace humour that works any week: the meeting that could have been an email, the 'quick call'.",
    fitReason: "Comedy creators can play multiple characters with one phone and one location.",
    angles: [
      { title: "Ek actor, paanch characters", description: "Boss, intern, 'you're on mute' wala, chai lover, aur HR." },
      { title: "Meeting translator", description: "Corporate lines ka seedha Hinglish translation on-screen text mein." },
    ],
    effort: "low",
    suggestedHashtags: ["#OfficeComedy", "#CorporateLife", "#HinglishComedy"],
    observations: [],
  },
  {
    id: "demo-opp-monsoon-snacks",
    title: "Ghar par street-style snacks",
    kind: "topic",
    group: "timely",
    categories: ["food"],
    languages: ["hinglish", "hindi"],
    regions: ["IN-north", "IN-west", "IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Street-food style snacks made with home kitchen ingredients, with a hygiene-first angle.",
    fitReason: "Food creators can show regional versions from their own city.",
    angles: [
      { title: "Thele wala vs ghar wala", description: "Same snack, dono tareeke — taste test family ke saath." },
      { title: "15 minute version", description: "Shortcut recipe jo office ke baad bhi ban jaaye." },
      { title: "Mere sheher ka version", description: "Regional twist with a short story about where you first ate it." },
    ],
    effort: "medium",
    suggestedHashtags: ["#StreetFoodAtHome", "#IndianSnacks", "#GharKaKhana"],
    observations: [
      { hoursAgo: 50, rank: 31, platform: "youtube", hashtags: ["#StreetFoodAtHome"] },
      { hoursAgo: 10, rank: 18, platform: "youtube", hashtags: ["#StreetFoodAtHome", "#IndianSnacks"] },
    ],
  },
  {
    id: "demo-opp-upi-safety",
    title: "UPI scam se kaise bachein",
    kind: "topic",
    group: "evergreen",
    categories: ["tech", "education", "family"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Practical safety habits for digital payments, explained for parents and first-time users.",
    fitReason: "Explainer creators can build trust with useful, non-alarmist safety content.",
    angles: [
      { title: "Papa ko samjhaya", description: "Real conversation format: aap apne parents ko 3 rules samjha rahe ho." },
      { title: "Red flags checklist", description: "On-screen checklist; har point ke saath ek safe action." },
    ],
    effort: "low",
    suggestedHashtags: ["#UPISafety", "#DigitalSafety", "#TechHindi"],
    sensitivityNote: "Safety advice: check details against official bank/NPCI guidance before posting.",
    observations: [],
  },
  {
    id: "demo-opp-festive-gifting",
    title: "Festive season: budget gifting ideas",
    kind: "event",
    group: "plan",
    categories: ["lifestyle", "art", "family"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "instagram_post", "facebook_post"],
    summary: "Thoughtful, low-cost gift ideas and DIY wrapping for the festive season.",
    fitReason: "Lifestyle and art creators can plan a short series ahead of the season.",
    angles: [
      { title: "DIY gift wrap with newspaper", description: "Ek minute ka process, final reveal slow-motion mein." },
      { title: "Gift by personality", description: "Har type ke dost ke liye ek idea — relatable categories." },
    ],
    effort: "medium",
    suggestedHashtags: ["#FestiveGifting", "#DIYGifts", "#BudgetGifts"],
    observations: [{ hoursAgo: 40, rank: 27, platform: "instagram", hashtags: ["#DIYGifts"] }],
  },
  {
    id: "demo-opp-hostel-life",
    title: "Hostel life ke unwritten rules",
    kind: "idea",
    group: "evergreen",
    categories: ["comedy", "lifestyle"],
    languages: ["hinglish"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "Relatable hostel and PG moments: Maggi at midnight, the borrowed charger, Sunday laundry.",
    fitReason: "Works as a series; each rule is one short video.",
    angles: [
      { title: "Rule #1 series", description: "Har video mein ek 'unwritten rule', same opening format." },
      { title: "Roommate types", description: "One-person sketch with quick costume changes." },
    ],
    effort: "low",
    suggestedHashtags: ["#HostelLife", "#CollegeLife", "#HinglishComedy"],
    observations: [],
  },
  {
    id: "demo-opp-ai-tools-students",
    title: "Students ke liye AI tools — sahi tareeka",
    kind: "topic",
    group: "timely",
    categories: ["education", "tech"],
    languages: ["hinglish", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "How students can use AI assistants for practice and doubt-solving without copying homework.",
    fitReason: "Educators can model responsible use with a live demo on a real question.",
    angles: [
      { title: "Copy nahi, coach", description: "Same question: 'answer do' vs 'mujhe step-by-step samjhao'." },
      { title: "Teacher reacts", description: "React to an AI explanation and point out what to double-check." },
    ],
    effort: "low",
    suggestedHashtags: ["#StudyWithAI", "#EdTechIndia", "#StudyTips"],
    sensitivityNote: "Avoid naming tools' features you haven't personally checked.",
    observations: [{ hoursAgo: 14, rank: 19, platform: "youtube", hashtags: ["#StudyWithAI"] }],
  },
  {
    id: "demo-opp-chai-cafe",
    title: "Cafe-style chai at home",
    kind: "idea",
    group: "evergreen",
    categories: ["food"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "instagram_post"],
    summary: "Turning everyday chai into a cafe-style presentation with things already in the kitchen.",
    fitReason: "Low-effort, highly visual — good for consistency weeks.",
    angles: [
      { title: "Tapri vs cafe", description: "Same chai, two presentations, honest taste verdict." },
      { title: "Chai ke 3 moods", description: "Morning, monsoon, late-night — ek hi recipe ke variations." },
    ],
    effort: "low",
    suggestedHashtags: ["#ChaiLovers", "#HomeCafe", "#IndianFood"],
    observations: [],
  },
  {
    id: "demo-opp-cricket-watch-party",
    title: "Cricket match watch-party snacks & reactions",
    kind: "event",
    group: "plan",
    categories: ["sports", "food", "comedy"],
    languages: ["hinglish", "hindi"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "Content planned around match days: snacks, family reactions, superstitions — without using broadcast footage.",
    fitReason: "Sports and comedy creators can prepare formats in advance and post on match day.",
    angles: [
      { title: "Ghar ke superstitions", description: "Har family member ka 'lucky' ritual — light comedy." },
      { title: "Over-by-over snack plan", description: "Food angle: ek snack har innings break ke liye." },
    ],
    effort: "medium",
    suggestedHashtags: ["#CricketFever", "#MatchDay", "#WatchParty"],
    sensitivityNote: "Do not use match broadcast clips or team logos without rights.",
    observations: [],
  },
  {
    id: "demo-opp-budget-gaming-setup",
    title: "Budget gaming setup tour",
    kind: "topic",
    group: "plan",
    categories: ["gaming", "tech"],
    languages: ["hinglish", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Setup tours that focus on what you actually use, with honest upgrade priorities.",
    fitReason: "Gaming creators can show their real setup instead of aspirational gear lists.",
    angles: [
      { title: "Agar ek hi upgrade karna ho", description: "Your honest #1 upgrade and why, with your own experience." },
      { title: "Setup on a study table", description: "Gaming + padhai on the same desk — space hacks." },
    ],
    effort: "medium",
    suggestedHashtags: ["#GamingSetup", "#BudgetSetup", "#IndianGamer"],
    observations: [],
  },
  {
    id: "demo-opp-regional-explainer",
    title: "Tech terms in your mother tongue",
    kind: "idea",
    group: "evergreen",
    categories: ["tech", "education"],
    languages: ["hindi", "hinglish"],
    regions: ["IN", "IN-north", "IN-east"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Explaining one tech term per video in simple Hindi with an everyday analogy.",
    fitReason: "Builds a recognisable series; low production effort once the format is set.",
    angles: [
      { title: "Ek shabd, ek example", description: "Cloud, cache, OTP — each with a ghar ka example." },
      { title: "Dadi ko samjhao", description: "Explain it so a grandparent would get it — on camera." },
    ],
    effort: "low",
    suggestedHashtags: ["#TechInHindi", "#TechExplained", "#HindiContent"],
    observations: [],
  },
];

/** Pre-written example conversation shown to demo users. Clearly labeled as an example. */
export const DEMO_EXAMPLE_INPUT =
  "Aaj maine apne budget phone se cinematic video shoot kiya.\nYe mera caption hai. Instagram ke liye better Hinglish caption aur relevant hashtags do.";

export const DEMO_EXAMPLE_RESULT: CaptionResult = {
  topicSummary:
    "You shot a cinematic-style video on a budget phone and want an Instagram Reels caption in Hinglish that makes people curious about how.",
  assumptions: [
    "Assumed the video shows the final cinematic footage (not a tutorial). If it's a tutorial, option C fits best.",
    "Phone model not mentioned, so no model name is used.",
  ],
  clarifyingQuestion: "Kya video mein aapne koi specific trick use ki (jaise slow pan ya window light)? Usse caption aur specific ho sakta hai.",
  variants: [
    {
      id: "A",
      approach: "Curiosity hook",
      caption: "Ye shot mehenge camera se nahi, mere budget phone se hai.\nBas light aur thoda patience. Aapko kaunsa frame sabse achha laga?",
      hashtags: ["#MobileFilmmaking", "#BudgetPhone", "#CinematicReels"],
    },
    {
      id: "B",
      approach: "Story-first",
      caption: "Socha tha cinematic video ke liye naya phone lena padega.\nPhir aaj apne purane budget phone se try kiya… result aapke saamne hai.\nAgle reel mein settings share karun?",
      hashtags: ["#MobileFilmmaking", "#PhoneCinematography", "#ReelsIndia"],
    },
    {
      id: "C",
      approach: "Practical value",
      caption: "Budget phone, cinematic look — aaj ka experiment.\nWhat helped: natural light, steady hands, slow movement.\nSave kar lo agar next shoot mein try karna hai.",
      hashtags: ["#MobileFilmmaking", "#FilmmakingTips", "#BudgetPhone"],
    },
  ],
  recommendedVariantId: "A",
  recommendationReason:
    "Option A leads with the surprising contrast (budget phone vs cinematic look) in the first line, which is what the video itself shows, and ends with an easy question.",
  hooks: [
    "Ye shot budget phone se hai. Yakeen nahi hoga.",
    "Cinematic video ke liye naya phone? Ruko.",
    "Same phone, bas light badli.",
  ],
  hashtagSuggestions: [
    { tag: "#MobileFilmmaking", reason: "Directly describes the content" },
    { tag: "#BudgetPhone", reason: "Matches the key contrast in your video" },
    { tag: "#CinematicReels", reason: "Describes the visual style for Reels viewers" },
    { tag: "#PhoneCinematography", reason: "Specific phrase people use for this skill" },
  ],
  keywords: ["budget phone cinematic video", "mobile se cinematic shot kaise le"],
  improvements: [
    "Original line only stated what happened; the new first lines create a contrast that makes people watch.",
    "Added a soft question to invite comments without engagement bait.",
    "Kept your Hinglish and didn't add any phone model or claims you didn't make.",
  ],
  limitations: ["This example was pre-written for the demo. It was not generated from your input."],
  platformVersions: [],
  platforms: [],
};
