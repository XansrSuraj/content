import type { CaptionResult } from "@/lib/domain/captions";
import { enforceConstraints, stripEmoji } from "@/lib/domain/captions";
import type { BriefContent } from "@/lib/domain/briefs";
import { dedupeHashtags, normalizeHashtag } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import type {
  BriefProvider,
  BriefProviderRequest,
  CaptionProvider,
  CaptionRequest,
  ProviderOutput,
} from "./types";

/**
 * Template preview: a deterministic, rule-based layout built only from the
 * creator's own words. It is NOT AI and is always labeled as such in the UI.
 * Placeholders in [square brackets] are for the creator to fill in.
 */

const STOPWORDS = new Set(
  (
    "a an the and or but if to of in on for with is are was were be been this that these those it its i me my mine we our you your " +
    "he she they them his her their what which who how why when where do does did done can could should would will just very so " +
    "aaj kal maine mera meri mere mujhe hum humne hamara aap aapka tum tumhara ye yeh wo woh is us iss uss hai hain tha thi the " +
    "ho hota hoti kar karo kiya kiye karna karke se ko ka ki ke mein me main par pe aur ya bhi hi toh to kya kaise kyun kab kahan " +
    "liye wala wali wale apne apna apni sab kuch bahut bohot ek do teen ab abhi ne na nahi nhi ji haan bas phir please caption " +
    "instagram youtube shorts reels reel facebook tiktok hashtag hashtags video better relevant de dena dijiye likho likh " +
    "hinglish hindi english acha achha accha improve"
  ).split(/\s+/),
);

export function extractKeywords(text: string, max = 6): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
    const w = raw.trim();
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}

const CTA: Record<string, Record<string, string>> = {
  hinglish: {
    engagement: "Aapka experience kya raha? Comments mein batao.",
    followers: "Aise aur videos ke liye follow kar lo.",
    community: "Apne us dost ko tag karo jo ye relate karega.",
    leads: "Details chahiye? Bio ka link check karo.",
    sales: "Product details bio ke link mein hain.",
  },
  hindi: {
    engagement: "आपका अनुभव कैसा रहा? कमेंट में बताइए।",
    followers: "ऐसे और वीडियो के लिए फ़ॉलो करें।",
    community: "उस दोस्त को टैग करें जो इससे जुड़ाव महसूस करेगा।",
    leads: "जानकारी चाहिए? बायो का लिंक देखें।",
    sales: "प्रोडक्ट की जानकारी बायो के लिंक में है।",
  },
  english: {
    engagement: "What's your take? Tell me in the comments.",
    followers: "Follow for more like this.",
    community: "Tag a friend who needs to see this.",
    leads: "Want details? Check the link in bio.",
    sales: "Product details are in the bio link.",
  },
};

/** Removes sentences that are requests to the tool ("caption do", "give me hashtags") rather than caption content. */
export function stripInstructions(text: string): string {
  const REQUEST = /(caption|hashtag|likh(o|do|ke)|de do|bata(o|do)|\bgive me\b|\bwrite\b|\bsuggest\b|\bimprove\b|\bmake it\b)/i;
  const sentences = text
    .split(/(?<=[.!?।])\s+|\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const kept = sentences.filter((x) => !REQUEST.test(x));
  return (kept.length ? kept : sentences).join("\n");
}

function firstSentence(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? text.trim();
  const m = line.match(/^(.{10,200}?[.!?।])(\s|$)/u);
  return (m ? m[1] : line).slice(0, 200);
}

export class TemplateCaptionProvider implements CaptionProvider {
  readonly name = "template";

  async generate(req: CaptionRequest): Promise<ProviderOutput<CaptionResult>> {
    const c = req.context;
    const platform = getPlatform(c.platform);
    const lang = c.language;
    const content = stripInstructions(req.originalInput);
    const opener = firstSentence(content);
    const cta = CTA[lang]?.[c.goal] ?? CTA.english.engagement;
    const keywords = extractKeywords(content);
    const tags = dedupeHashtags(keywords.slice(0, platform.hashtagRule.copyDefault).map(normalizeHashtag));
    const detail =
      lang === "english"
        ? "[Add one specific detail: what, how, or how long it took]"
        : lang === "hindi"
          ? "[एक खास बात जोड़ें: क्या, कैसे, या कितना समय लगा]"
          : "[Ek specific detail add karo: kya kiya, kaise kiya, kitna time laga]";
    const question =
      lang === "english" ? "[A question your viewer relates to?]" : lang === "hindi" ? "[ऐसा सवाल जो दर्शक से जुड़े?]" : "[Ek sawaal jo viewer relate kare?]";

    const short = c.length === "short";
    const variants: CaptionResult["variants"] = [
      {
        id: "A",
        approach: "Template: hook → detail → CTA",
        caption: short ? `${opener}\n${cta}` : `${opener}\n\n${detail}\n\n${cta}`,
        hashtags: tags,
      },
      {
        id: "B",
        approach: "Template: question opener",
        caption: short ? `${question}\n${opener}` : `${question}\n\n${opener}\n${detail}\n\n${cta}`,
        hashtags: tags,
      },
      {
        id: "C",
        approach: "Template: your words, tidied",
        caption: `${content.trim().slice(0, short ? 220 : 1200)}${short ? "" : `\n\n${cta}`}`,
        hashtags: tags,
      },
    ].map((v) => (c.emoji === "none" ? { ...v, caption: stripEmoji(v.caption) } : v)) as CaptionResult["variants"];

    const result: CaptionResult = {
      topicSummary: `Template preview (AI not used). Built from your first line: "${opener.slice(0, 120)}"`,
      assumptions: [
        "No AI provider is configured, so your text was not interpreted. Fill the [bracketed] parts yourself.",
      ],
      clarifyingQuestion: null,
      variants,
      recommendedVariantId: "A",
      recommendationReason: "Template A gives the clearest structure to fill in. This is a layout suggestion, not an AI judgment.",
      hooks: [opener, question],
      hashtagSuggestions: tags.map((tag) => ({ tag, reason: "Keyword taken from your own text" })),
      keywords: keywords.slice(0, 4),
      improvements: ["Adds a structure: hook, one concrete detail, and a goal-matched call to action."],
      limitations: [
        "Template output only. To get real rewrites, configure ANTHROPIC_API_KEY and ANTHROPIC_MODEL on the server.",
      ],
    };
    return {
      data: enforceConstraints(result, c),
      mode: "template_preview",
      usage: { inputTokens: 0, outputTokens: 0, model: null },
    };
  }
}

export class TemplateBriefProvider implements BriefProvider {
  readonly name = "template";

  async generate(req: BriefProviderRequest): Promise<ProviderOutput<Omit<BriefContent, "sourceRefs">>> {
    const platform = getPlatform(req.platform);
    const tags = dedupeHashtags(extractKeywords(req.topic, 4).map(normalizeHashtag)).slice(
      0,
      platform.hashtagRule.copyDefault,
    );
    const data: Omit<BriefContent, "sourceRefs"> = {
      originalAngle: req.angle
        ? `Your chosen angle: ${req.angle}`
        : `[Write your own angle on "${req.topic}": what do YOU know or have experienced about it?]`,
      intendedAudience: "[Who exactly is this for? e.g. first-time phone buyers in tier-2 cities]",
      hooks: [
        `[Start with the most surprising true thing about ${req.topic}]`,
        "[Start with a relatable problem your audience has]",
      ],
      openingShot: "[Your face + the subject in the first frame, with on-screen text of the hook]",
      beats: [
        { beat: "Hook", detail: "[0–3 sec: the promise of the video]" },
        { beat: "Context", detail: "[Why this matters to the viewer]" },
        { beat: "Your take", detail: req.personalExample ? `Use your example: ${req.personalExample}` : "[Your personal example or demo]" },
        { beat: "Payoff", detail: "[The answer, result, or punchline]" },
      ],
      callToAction: "[One clear ask that fits your goal]",
      titleOptions: [`[Title idea about ${req.topic}]`],
      hashtags: tags,
      factsToVerify: ["Check every fact, date, and name from the evidence links before posting."],
      lowEffortVersion: "Talking-head video: one take, phone camera, on-screen text for the hook, 3 beats.",
      platformNotes: [`${platform.label}: ${platform.hashtagRule.placement}.`],
      assumptions: ["Template preview: AI not used. Configure the AI provider for a personalised brief."],
    };
    return { data, mode: "template_preview", usage: { inputTokens: 0, outputTokens: 0, model: null } };
  }
}
