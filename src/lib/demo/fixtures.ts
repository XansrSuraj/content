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
    id: "demo-opp-match-day-preview",
    title: "60-second match-day preview",
    kind: "event",
    group: "timely",
    categories: ["sports"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "A quick preview posted before a big match: the one battle to watch, your honest prediction and a question for fans.",
    fitReason: "Cricket and football creators can post this every match day with only a phone and their own opinion — no broadcast footage needed.",
    angles: [
      { title: "Ek battle, ek prediction", description: "Sirf ek matchup pe focus karo (opener vs new ball, striker vs keeper) aur apni prediction do." },
      { title: "Fans se poll", description: "End mein seedha sawaal: 'Aapki team ka X-factor kaun?' — comments mein jawab aayenge." },
      { title: "Pichhli baar kya hua tha", description: "Sirf wahi yaad dilao jo aap pakka jaante ho; score tabhi likho jab verify kar liya ho." },
    ],
    effort: "low",
    suggestedHashtags: ["#MatchDay", "#MatchPreview", "#CricketFans", "#FootballFans"],
    observations: [
      { hoursAgo: 30, rank: 14, platform: "youtube", hashtags: ["#MatchPreview", "#CricketFans"] },
      { hoursAgo: 6, rank: 6, platform: "youtube", hashtags: ["#MatchDay", "#MatchPreview"] },
    ],
  },
  {
    id: "demo-opp-playing-xi-debate",
    title: "Apni playing XI chuno — fan debate",
    kind: "idea",
    group: "plan",
    categories: ["sports"],
    languages: ["hinglish", "hindi"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "You pick your XI for the next match and explain one tough call. Fans love to disagree in the comments.",
    fitReason: "Opinion formats need no footage and invite genuine discussion around every squad announcement.",
    angles: [
      { title: "Ek tough call", description: "Poori team mat padho — sirf woh ek naam jis pe aap confused ho, aur kyun." },
      { title: "Fan vs creator XI", description: "Pinned comment mein fans apni XI likhein; agle video mein best wali dikhao." },
    ],
    effort: "low",
    suggestedHashtags: ["#PlayingXI", "#FanDebate", "#CricketFans"],
    observations: [{ hoursAgo: 20, rank: 22, platform: "youtube", hashtags: ["#PlayingXI"] }],
  },
  {
    id: "demo-opp-reaction-without-clips",
    title: "Match reaction without broadcast clips",
    kind: "topic",
    group: "timely",
    categories: ["sports"],
    languages: ["hinglish", "hindi", "english"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "React to the big moment of the match on camera — your face, your words, your whiteboard — instead of re-uploading TV footage.",
    fitReason: "Keeps your account safe from copyright strikes while still joining the post-match conversation.",
    angles: [
      { title: "Whiteboard breakdown", description: "Ek moment ko diagram se samjhao: field placement ya defensive line." },
      { title: "Mera live reaction", description: "Match dekhte hue apna reaction record karo — sirf apna chehra aur awaaz." },
    ],
    effort: "medium",
    suggestedHashtags: ["#MatchReaction", "#CricketReaction", "#FootballReaction"],
    sensitivityNote: "Do not use match broadcast clips or team logos without rights.",
    observations: [{ hoursAgo: 4, rank: 9, platform: "instagram", hashtags: ["#MatchReaction"] }],
  },
  {
    id: "demo-opp-skill-three-levels",
    title: "Ek skill, teen level — football tutorial",
    kind: "idea",
    group: "evergreen",
    categories: ["sports"],
    languages: ["hinglish", "english"],
    regions: ["IN"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Show one football skill at beginner, intermediate and advanced level on your local turf or street.",
    fitReason: "A series format that works any week, not just on match days.",
    angles: [
      { title: "Beginner se pro", description: "Same skill teen speed pe — har level ki ek common mistake bhi dikhao." },
      { title: "Dost ko sikhao", description: "Ek dost jo football nahi khelta, use 10 minute mein sikhao — on camera." },
    ],
    effort: "medium",
    suggestedHashtags: ["#FootballSkills", "#FootballTutorial", "#TurfFootball"],
    observations: [],
  },
  {
    id: "demo-opp-gully-cricket",
    title: "Gully cricket rules jo sirf India mein hain",
    kind: "idea",
    group: "evergreen",
    categories: ["sports"],
    languages: ["hinglish", "hindi"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "One-tip-one-hand, ghar ki khidki out — a light, relatable series about street cricket rules.",
    fitReason: "Relatable and nostalgic; works for cricket creators with a light, funny style.",
    angles: [
      { title: "Rule ka origin", description: "Har episode mein ek rule aur uski funny backstory." },
      { title: "Aapke mohalle ka rule", description: "Fans se poochho unke area ka ajeeb rule — agle video mein feature karo." },
    ],
    effort: "low",
    suggestedHashtags: ["#GullyCricket", "#StreetCricket", "#CricketLovers"],
    observations: [],
  },
  {
    id: "demo-opp-stats-explained",
    title: "Stats explained simply: strike rate, economy, xG",
    kind: "idea",
    group: "evergreen",
    categories: ["sports"],
    languages: ["hindi", "hinglish"],
    regions: ["IN", "IN-north", "IN-east"],
    platforms: [...ALL_SHORT, "youtube"],
    summary: "Explain one cricket or football stat per video in simple Hindi with an everyday example.",
    fitReason: "Builds a recognisable explainer series; low production effort once the format is set.",
    angles: [
      { title: "Ek stat, ek example", description: "Strike rate ko auto-rickshaw ke meter se samjhao, xG ko penalty shootout se." },
      { title: "Commentary decoder", description: "Commentators ke 3 shabd jo sab bolte hain par koi samjhata nahi." },
    ],
    effort: "low",
    suggestedHashtags: ["#CricketStats", "#FootballStats", "#SportsExplained"],
    observations: [],
  },
  {
    id: "demo-opp-cricket-watch-party",
    title: "Cricket match watch-party snacks & reactions",
    kind: "event",
    group: "plan",
    categories: ["sports"],
    languages: ["hinglish", "hindi"],
    regions: ["IN"],
    platforms: ALL_SHORT,
    summary: "Content planned around match days: snacks, family reactions, superstitions — without using broadcast footage.",
    fitReason: "Sports creators can prepare formats in advance and post on match day.",
    angles: [
      { title: "Ghar ke superstitions", description: "Har family member ka 'lucky' ritual — light comedy." },
      { title: "Over-by-over snack plan", description: "Ek snack har innings break ke liye." },
    ],
    effort: "medium",
    suggestedHashtags: ["#CricketFever", "#MatchDay", "#WatchParty"],
    sensitivityNote: "Do not use match broadcast clips or team logos without rights.",
    observations: [],
  },
];

/** Pre-written example conversation shown to demo users. Clearly labeled as an example. */
export const DEMO_EXAMPLE_INPUT =
  "Aaj gully cricket mein last ball pe six maar ke match jitaya!\nYe mera caption hai. Instagram ke liye better Hinglish caption aur relevant hashtags do.";

export const DEMO_EXAMPLE_RESULT: CaptionResult = {
  topicSummary:
    "You won a gully cricket match with a six off the last ball and want an Instagram Reels caption in Hinglish that brings out the moment.",
  assumptions: [
    "Assumed the video shows the last ball and the celebration. If it's only the celebration, option B fits best.",
    "No team or ground name was given, so none is used.",
  ],
  clarifyingQuestion: "Kitne run chahiye the last ball pe? Agar bataoge to caption aur specific ho sakta hai.",
  variants: [
    {
      id: "A",
      approach: "Moment first",
      caption: "Last ball. Ek hi option tha — six.\nAur gully ne dekha. Aapka sabse yaadgaar gully cricket moment kaunsa hai?",
      hashtags: ["#GullyCricket", "#LastBallSix", "#CricketLovers"],
    },
    {
      id: "B",
      approach: "Story-first",
      caption: "Sab bol rahe the match gaya.\nPhir last ball aayi… baaki video mein dekho.\nAapke mohalle mein bhi aise hero hain?",
      hashtags: ["#GullyCricket", "#StreetCricket", "#ReelsIndia"],
    },
    {
      id: "C",
      approach: "Conversation",
      caption: "Gully cricket, last ball, six — aaj ka scene.\nTag karo us dost ko jo hamesha last ball pe out hota hai.",
      hashtags: ["#GullyCricket", "#CricketFans", "#StreetCricket"],
    },
  ],
  recommendedVariantId: "A",
  recommendationReason:
    "Option A puts the last-ball moment in the first line, which is what the video shows, and ends with an easy question for fans.",
  hooks: ["Last ball. Six chahiye tha.", "Gully cricket ka sabse bada pressure.", "Match gaya tha… phir ye hua."],
  hashtagSuggestions: [
    { tag: "#GullyCricket", reason: "Directly describes the content" },
    { tag: "#LastBallSix", reason: "Matches the key moment in your video" },
    { tag: "#StreetCricket", reason: "Phrase people use for this kind of cricket" },
    { tag: "#CricketLovers", reason: "Broad cricket audience" },
  ],
  keywords: ["gully cricket last ball six", "street cricket winning moment"],
  improvements: [
    "Original line only stated what happened; the new first line puts viewers inside the last-ball moment.",
    "Added a soft question to invite comments without engagement bait.",
    "Kept your Hinglish and didn't add any score, name or claim you didn't make.",
  ],
  limitations: ["This example was pre-written for the demo. It was not generated from your input."],
  platformVersions: [],
  platforms: [],
};
