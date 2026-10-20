/** Small microcopy dictionary. Hinglish is the default UI language; English is the alternative. */

export type UiLang = "hinglish" | "english";

const DICT = {
  home: { hinglish: "Home", english: "Home" },
  studio: { hinglish: "Caption Studio", english: "Caption Studio" },
  opportunities: { hinglish: "Ideas & trends", english: "Opportunities" },
  briefs: { hinglish: "Briefs", english: "Briefs" },
  saved: { hinglish: "Saved", english: "Saved" },
  published: { hinglish: "Published", english: "Published" },
  settings: { hinglish: "Settings", english: "Settings" },
  admin: { hinglish: "Admin", english: "Admin" },
  welcome: { hinglish: "Namaste", english: "Welcome" },
  homeLead: {
    hinglish: "Aaj kya banana hai? Caption sudharo, ya naya idea dhoondo.",
    english: "What are you making today? Improve a caption or find a new idea.",
  },
  studioLead: {
    hinglish: "Apna caption paste karo ya video ke baare mein batao. Hum 3 alag options denge.",
    english: "Paste your caption or describe your video. You'll get three different options.",
  },
  studioPlaceholder: {
    hinglish: "Jaise: Aaj maine apne budget phone se cinematic video shoot kiya. Instagram ke liye better Hinglish caption do.",
    english: "e.g. I shot a cinematic video on my budget phone today. Give me a better Instagram caption.",
  },
  send: { hinglish: "Bhejo", english: "Send" },
  followUpPlaceholder: {
    hinglish: "Follow-up likho: 'Aur short karo', 'Emoji hata do'…",
    english: "Follow up: 'Make it shorter', 'Remove emoji'…",
  },
  oppsLead: {
    hinglish: "Aapki category ke hisaab se ideas — har idea ke saath uska evidence aur source.",
    english: "Ideas for your niche — each with its evidence and sources.",
  },
} as const;

export type DictKey = keyof typeof DICT;

export function t(lang: UiLang, key: DictKey): string {
  return DICT[key][lang];
}
