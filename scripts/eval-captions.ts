/**
 * Caption quality eval — runs fixed cases through the real caption service with
 * whichever AI provider is configured, and writes a report to
 * eval-output/captions-<timestamp>.md. Never part of `npm test` or CI.
 *
 *   npm run eval:captions                       # provider from .env.local
 *   AI_PROVIDER=ollama npm run eval:captions    # force the local model
 *   npm run eval:captions -- --only=hindi,followups
 *
 * Uses an in-memory database, so your local data is untouched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Isolate from local data and lift quotas before any app module reads config.
process.env.DATABASE_URL = "memory://";
process.env.AI_REQUESTS_PER_USER_PER_MINUTE = "1000";
process.env.AI_REQUESTS_PER_USER_PER_DAY = "1000";

type Ctx = Partial<import("../src/lib/domain/captions").CaptionContext>;
type Result = import("../src/lib/domain/captions").CaptionResult;

interface Turn {
  message: string;
  context?: Ctx;
  expect?: ("shorter" | "no_emoji" | "first_line_locked" | "tone_changed")[];
}
interface Case {
  id: string;
  title: string;
  language: "hinglish" | "hindi" | "english";
  turns: Turn[];
  /** Sports cases: what a correct answer must (not) do. */
  sports?: { expectMatch?: boolean; expectQuestion?: boolean; expectStage?: string; noResultClaim?: boolean };
}

// ---------- Sports fixtures seeded into the eval's in-memory DB (times relative to "now", IST calendar) ----------
function istDay(offset: number, time: string): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.parse(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`));
}
const fx = (o: Record<string, unknown>) => ({
  provider: "eval",
  sport: "cricket",
  competition: "IPL",
  competitionId: "cricket:ipl",
  gender: "men",
  status: "scheduled",
  statusSource: "provider",
  statusCheckedAt: new Date(),
  resultSummary: null,
  url: null,
  verified: true,
  ...o,
});
const SPORTS_FIXTURES = () => [
  fx({ externalId: "rcb-mi-next", homeTeamId: "cricket:rcb", awayTeamId: "cricket:mi", homeName: "Royal Challengers Bengaluru", awayName: "Mumbai Indians", startsAt: istDay(1, "19:30") }),
  fx({ externalId: "rcb-mi-prev", homeTeamId: "cricket:rcb", awayTeamId: "cricket:mi", homeName: "Royal Challengers Bengaluru", awayName: "Mumbai Indians", startsAt: istDay(-1, "19:30"), status: "finished", resultSummary: "Royal Challengers Bengaluru won by 5 wickets" }),
  fx({ externalId: "ind-aus-w", competition: "Australia Women tour of India", competitionId: "cricket:intl_w", gender: "women", homeTeamId: "cricket:ind_w", awayTeamId: "cricket:aus_w", homeName: "India Women", awayName: "Australia Women", startsAt: istDay(1, "13:30") }),
  fx({ externalId: "ind-aus-next", competition: "Australia tour of India", competitionId: "cricket:intl", homeTeamId: "cricket:ind", awayTeamId: "cricket:aus", homeName: "India", awayName: "Australia", startsAt: istDay(1, "09:30") }),
  fx({ externalId: "ind-aus-prev", competition: "Australia tour of India", competitionId: "cricket:intl", homeTeamId: "cricket:ind", awayTeamId: "cricket:aus", homeName: "India", awayName: "Australia", startsAt: istDay(-1, "09:30"), status: "finished", resultSummary: "Australia won by 3 wickets" }),
  fx({ externalId: "ind-pak", competition: "Asia Cup", competitionId: "cricket:asiacup", homeTeamId: "cricket:ind", awayTeamId: "cricket:pak", homeName: "India", awayName: "Pakistan", startsAt: istDay(1, "19:30"), status: "postponed" }),
  fx({ externalId: "ars-eve", sport: "football", competition: "Premier League", competitionId: "football:pl", homeTeamId: "football:arsenal", awayTeamId: "football:everton", homeName: "Arsenal FC", awayName: "Everton FC", startsAt: istDay(2, "19:30"), statusSource: "schedule_only", verified: false }),
  fx({ externalId: "rma-bar", sport: "football", competition: "LaLiga", competitionId: "football:laliga", homeTeamId: "football:realmadrid", awayTeamId: "football:barcelona", homeName: "Real Madrid", awayName: "FC Barcelona", startsAt: istDay(-1, "00:30"), status: "finished", statusSource: "schedule_only", verified: false, resultSummary: "Real Madrid 2–1 FC Barcelona (full time, community data)" }),
  fx({ externalId: "bay-psg", sport: "football", competition: "UEFA Champions League", competitionId: "football:ucl", homeTeamId: "football:bayern", awayTeamId: "football:psg", homeName: "FC Bayern München", awayName: "Paris Saint-Germain", startsAt: istDay(-1, "00:30"), status: "finished", resultSummary: "FC Bayern München 1–1 Paris Saint-Germain (full time)" }),
];
const IG_YT = { platform: "instagram_reels" as const, extraPlatforms: ["youtube_shorts" as const] };

const SPORTS_CASES: Case[] = [
  { id: "s-ipl-preview", title: "IPL preview — RCB vs MI tomorrow (Hinglish, IG + Shorts)", language: "hinglish", sports: { expectMatch: true, expectStage: "upcoming", noResultClaim: true },
    turns: [{ message: "RCB vs MI kal khelenge, mera preview reel. Kohli ki form pe baat ki hai", context: { ...IG_YT, language: "hinglish" } }, { message: "Make it shorter.", expect: ["shorter"] }] },
  { id: "s-ipl-recap-hi", title: "IPL recap — yesterday, verified result (Hindi)", language: "hindi", sports: { expectMatch: true, expectStage: "completed" },
    turns: [{ message: "आरसीबी और एमआई का कल जो मैच हुआ, उसकी हाइलाइट्स पर मेरा रिएक्शन वीडियो", context: { platform: "instagram_reels", language: "hindi" } }] },
  { id: "s-women-en", title: "Women's ODI preview (English)", language: "english", sports: { expectMatch: true, expectStage: "upcoming", noResultClaim: true },
    turns: [{ message: "India vs Australia women's ODI preview for tomorrow, my players to watch", context: { platform: "instagram_reels", language: "english" } }] },
  { id: "s-historical", title: "Historical highlight — Kohli 2016 (Hinglish)", language: "hinglish", sports: { expectMatch: false, noResultClaim: false },
    turns: [{ message: "Kohli ki 2016 wali century yaad hai? Throwback edit bana diya", context: { platform: "instagram_reels", language: "hinglish" } }] },
  { id: "s-mi-ambiguous", title: "Ambiguous 'MI' (Hinglish)", language: "hinglish", sports: { expectQuestion: true, noResultClaim: true },
    turns: [{ message: "MI ka match kal, preview reel", context: { platform: "instagram_reels", language: "hinglish" } }] },
  { id: "s-kal-ambiguous", title: "Ambiguous 'kal' — India vs Australia (Hinglish)", language: "hinglish", sports: { expectMatch: false, noResultClaim: true },
    turns: [{ message: "India Australia kal match pe meri baat", context: { platform: "instagram_reels", language: "hinglish" } }] },
  { id: "s-epl-preview", title: "Premier League preview — Arsenal vs Everton (English, YouTube)", language: "english", sports: { expectMatch: true, expectStage: "upcoming", noResultClaim: true },
    turns: [{ message: "Arsenal vs Everton preview: who wins this one?", context: { platform: "youtube", language: "english" } }] },
  { id: "s-clasico", title: "El Clásico reaction — community result (Hinglish)", language: "hinglish", sports: { expectMatch: true, expectStage: "completed", noResultClaim: true },
    turns: [{ message: "Real vs Barca El Clasico mein jo hua, mera reaction", context: { platform: "instagram_reels", language: "hinglish" } }] },
  { id: "s-ronaldo-hi", title: "Ronaldo free kick (Hindi)", language: "hindi", sports: { expectMatch: false },
    turns: [{ message: "रोनाल्डो का अल नासर के लिए फ्री किक, सिउउ! फुटबॉल का जादू", context: { platform: "instagram_reels", language: "hindi" } }] },
  { id: "s-post-after-kickoff", title: "Scheduled after kick-off — neutral wording (Hinglish)", language: "hinglish", sports: { expectMatch: true, expectStage: "unknown", noResultClaim: true },
    turns: [{ message: "RCB vs MI kal ka match preview", context: { platform: "instagram_reels", language: "hinglish", publishAt: istDay(2, "10:00").toISOString() } }] },
  { id: "s-postponed", title: "Postponed — India vs Pakistan (English)", language: "english", sports: { expectMatch: true, expectStage: "postponed", noResultClaim: true },
    turns: [{ message: "India vs Pakistan tomorrow, my preview video", context: { platform: "instagram_reels", language: "english" } }] },
  { id: "s-ucl-analysis", title: "UCL analysis — YouTube long (English)", language: "english", sports: { expectMatch: true, expectStage: "completed" },
    turns: [{ message: "Bayern vs PSG Champions League analysis — tactics breakdown from last night", context: { platform: "youtube", language: "english" } }] },
];

const PASTED = "Aaj ka vlog: maine ghar pe pehli baar pizza banaya 🍕\nOven nahi tha toh kadhai mein try kiya. Result dekh ke batao kaisa laga!";

const BASE_CASES: Case[] = [
  {
    id: "budget-phone",
    title: "Budget phone review (Hinglish)",
    language: "hinglish",
    turns: [
      {
        message: "Maine apne budget phone ka 1 hafte use karne ke baad honest review video banaya. Camera achha hai par battery average hai. Instagram Reels ke liye caption do.",
        context: { platform: "instagram_reels", language: "hinglish", tone: "conversational" },
      },
    ],
  },
  {
    id: "hindi",
    title: "Budget phone review (Hindi, Devanagari)",
    language: "hindi",
    turns: [
      {
        message: "मैंने अपने बजट फ़ोन को एक हफ़्ते इस्तेमाल करने के बाद ईमानदार रिव्यू वीडियो बनाया। कैमरा अच्छा है लेकिन बैटरी औसत है। इंस्टाग्राम रील के लिए कैप्शन दीजिए।",
        context: { platform: "instagram_reels", language: "hindi", tone: "conversational" },
      },
    ],
  },
  {
    id: "comedy",
    title: "Comedy skit (Hinglish)",
    language: "hinglish",
    turns: [
      {
        message: "Comedy skit: mummy ko WiFi password samjhana, aur wo har baar 'bas ek baar aur bata do' bolti hain. Reel ke liye funny caption chahiye.",
        context: { platform: "instagram_reels", language: "hinglish", tone: "funny" },
      },
    ],
  },
  {
    id: "kids-edu",
    title: "Kids educational video (English)",
    language: "english",
    turns: [
      {
        message: "An educational video for kids aged 6-9 explaining why the sky is blue, using a torch and a glass of water. Caption for YouTube.",
        context: { platform: "youtube", language: "english", tone: "educational", audience: "parents of kids aged 6-9" },
      },
    ],
  },
  {
    id: "cricket",
    title: "Cricket reaction (Hinglish)",
    language: "hinglish",
    turns: [
      {
        message: "Kal ke match ka last over dekh ke meri aur mere bhai ki live reaction video. Hum dono ne pura over khade hoke dekha. YouTube Shorts ke liye caption.",
        context: { platform: "youtube_shorts", language: "hinglish", tone: "energetic" },
      },
    ],
  },
  {
    id: "pasted",
    title: "Pasted caption to improve (Hinglish)",
    language: "hinglish",
    turns: [{ message: `Ye mera caption hai, isko better karo:\n${PASTED}`, context: { platform: "instagram_reels", language: "hinglish" } }],
  },
  {
    id: "followups",
    title: "Follow-ups on one conversation",
    language: "hinglish",
    turns: [
      { message: PASTED, context: { platform: "instagram_reels", language: "hinglish", tone: "conversational", length: "medium" } },
      { message: "Aur short karo.", expect: ["shorter"] },
      { message: "Emoji hata do.", expect: ["no_emoji"] },
      { message: "Meri first line same rakho.", expect: ["first_line_locked", "no_emoji"] },
      { message: "Ab professional tone mein likho.", context: { tone: "professional" }, expect: ["tone_changed", "first_line_locked", "no_emoji"] },
    ],
  },
];

const CASES: Case[] = [...BASE_CASES, ...SPORTS_CASES];

// ---------- Automatic checks ----------

const EMOJI = /\p{Extended_Pictographic}/u;
const HYPE = /\b(trending|viral|virality|go viral|guaranteed|algorithm|blow up)\b/i;
const HINDI_FUNCTION_WORDS = /\b(hai|hain|ka|ki|ke|ko|se|mein|me|ye|yeh|kya|aur|nahi|bhi|toh|tha|hoga|karo|kar)\b/i;

function words(s: string) {
  return new Set(s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length > 2));
}
function jaccard(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return A.size + B.size === 0 ? 0 : inter / (A.size + B.size - inter);
}
function devanagariShare(s: string) {
  const letters = s.match(/\p{L}/gu) ?? [];
  const dev = s.match(/[ऀ-ॿ]/g) ?? [];
  return letters.length ? dev.length / letters.length : 0;
}
function avgLen(r: Result) {
  return r.variants.reduce((n, v) => n + v.caption.length, 0) / r.variants.length;
}

function qualityFlags(r: Result, c: Case, input: string): string[] {
  const flags: string[] = [];
  const caps = r.variants.map((v) => v.caption);
  const pairs = [jaccard(caps[0], caps[1]), jaccard(caps[0], caps[2]), jaccard(caps[1], caps[2])];
  if (Math.max(...pairs) > 0.6) flags.push(`options too similar (max word overlap ${Math.max(...pairs).toFixed(2)})`);
  if (new Set(r.variants.map((v) => v.approach.toLowerCase())).size < 3) flags.push("approach labels repeat");
  const text = [...caps, ...r.hooks, r.topicSummary].join("\n");
  if (HYPE.test(text)) flags.push(`hype/trend wording: "${text.match(HYPE)?.[0]}"`);
  const inputNums = new Set(input.match(/\d+/g) ?? []);
  const newNums = [...new Set((caps.join(" ").match(/\d+/g) ?? []).filter((n) => !inputNums.has(n)))];
  if (newNums.length) flags.push(`numbers not in the input: ${newNums.join(", ")}`);
  if (c.language === "hindi") {
    const share = devanagariShare(caps.join(" "));
    if (share < 0.7) flags.push(`Devanagari share only ${(share * 100).toFixed(0)}%`);
  }
  if (c.language === "hinglish") {
    if (devanagariShare(caps.join(" ")) > 0.2) flags.push("Hinglish written in Devanagari");
    const hinglishish = caps.filter((x) => HINDI_FUNCTION_WORDS.test(x)).length;
    if (hinglishish < 2) flags.push("reads as plain English, not Hinglish");
  }
  const longHooks = r.hooks.filter((h) => h.split(/\s+/).length > 14);
  if (longHooks.length) flags.push(`${longHooks.length} hook(s) longer than 14 words`);
  const tagCount = Math.max(...r.variants.map((v) => v.hashtags.length));
  if (tagCount > 8) flags.push(`up to ${tagCount} hashtags on one option`);
  return flags;
}

// ---------- Runner ----------

interface TurnLog {
  message: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  mode?: string;
  result?: Result;
  flags: string[];
  constraintResults: string[];
  context?: Ctx;
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  const { getDb, closeDb } = await import("../src/lib/db/client");
  const { users } = await import("../src/lib/db/schema");
  const { runCaptionTurn } = await import("../src/lib/services/captions");
  const { getCaptionProvider } = await import("../src/lib/providers/ai");
  const { aiStatus } = await import("../src/lib/config");

  const db = await getDb();
  const { upsertMatches } = await import("../src/lib/repo/sports");
  const { validateResult } = await import("../src/lib/domain/validate-output");
  const { parseSportsIntent } = await import("../src/lib/domain/sports/intent");
  await upsertMatches(db, SPORTS_FIXTURES() as never);
  const paceMs = Number(process.env.EVAL_PACE_MS ?? 0);
  const [u] = await db.insert(users).values({ email: `eval-${Date.now()}@eval.local` }).returning();
  const user = { id: u.id, email: u.email, role: u.role, isDemo: false };
  const provider = getCaptionProvider();
  const status = aiStatus();
  const providerLabel =
    status.kind === "live"
      ? `Anthropic (${status.model})`
      : status.kind === "open"
        ? `${status.host} (${status.model})`
        : status.kind === "local"
          ? `Ollama (${status.model}) — local development model`
          : "Template preview (no AI)";
  console.log(`Provider: ${providerLabel}`);

  const logs: { c: Case; turns: TurnLog[] }[] = [];
  for (const c of CASES.filter((x) => !only || only.includes(x.id))) {
    let conversationId: string | null = null;
    let prev: Result | null = null;
    const turns: TurnLog[] = [];
    for (const t of c.turns) {
      process.stdout.write(`  ${c.id}: "${t.message.slice(0, 40)}"… `);
      const started = Date.now();
      const res = await runCaptionTurn(db, user, { conversationId, message: t.message, context: t.context, opportunityId: null }, provider);
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const e = res.error;
        const msg = e.kind === "provider" ? `${e.code}: ${e.message}` : e.kind;
        console.log(`FAILED (${msg}) ${latencyMs}ms`);
        turns.push({ message: t.message, ok: false, error: msg, latencyMs, flags: [], constraintResults: [] });
        if (paceMs) await new Promise((ok) => setTimeout(ok, paceMs));
        continue;
      }
      conversationId = res.value.conversationId;
      const r = res.value.assistantMessage.result as unknown as Result;
      const ctx = res.value.context;
      const constraintResults: string[] = [];
      for (const ex of t.expect ?? []) {
        if (ex === "shorter") {
          const ok = prev ? avgLen(r) < avgLen(prev) : false;
          constraintResults.push(`${ok ? "PASS" : "FAIL"} shorter (avg ${Math.round(prev ? avgLen(prev) : 0)} → ${Math.round(avgLen(r))} chars; length=${ctx.length})`);
        }
        if (ex === "no_emoji") {
          const ok = r.variants.every((v) => !EMOJI.test(v.caption)) && r.hooks.every((h) => !EMOJI.test(h));
          constraintResults.push(`${ok ? "PASS" : "FAIL"} no emoji (emoji=${ctx.emoji})`);
        }
        if (ex === "first_line_locked") {
          const ok = Boolean(ctx.keepFirstLine) && r.variants.every((v) => v.caption.split("\n")[0].trim() === ctx.keepFirstLine);
          constraintResults.push(`${ok ? "PASS" : "FAIL"} first line locked ("${ctx.keepFirstLine ?? "none"}")`);
        }
        if (ex === "tone_changed") {
          constraintResults.push(`${ctx.tone === "professional" ? "PASS" : "FAIL"} tone=${ctx.tone}`);
        }
      }
      const flags = qualityFlags(r, c, t.message);
      // Sports: re-run the deterministic validator on the final answer and check the expectations.
      const sp = res.value.assistantMessage.sports;
      if (c.sports) {
        const exp = c.sports;
        if (exp.expectMatch !== undefined && Boolean(sp?.match) !== exp.expectMatch) flags.push(`match ${sp?.match ? "attached" : "not attached"} (expected ${exp.expectMatch ? "attached" : "none"})`);
        if (exp.expectQuestion && !sp?.question) flags.push("expected one targeted question, got none");
        if (exp.expectStage && sp?.match && sp.match.stage !== exp.expectStage) flags.push(`stage ${sp.match.stage} (expected ${exp.expectStage})`);
        const issues = validateResult(r, {
          sourceText: c.turns.map((x) => x.message).join("\n"),
          evidenceText: JSON.stringify(sp?.match ?? {}),
          intent: parseSportsIntent(c.turns.map((x) => x.message).join("\n")),
          matchTeamIds: [],
          stage: (sp?.match?.stage as never) ?? null,
          resultVerified: Boolean(sp?.match?.stage === "completed" && sp.match.statusSource === "provider"),
          language: c.language,
        }).filter((i) => i.code !== "extra_entity");
        for (const i of issues.slice(0, 4)) flags.push(`validator: ${i.platform}/${i.kind}/${i.field}: ${i.detail}`);
      }
      console.log(`ok ${latencyMs}ms${flags.length ? ` · ${flags.length} flag(s)` : ""}${constraintResults.length ? ` · ${constraintResults.join("; ")}` : ""}`);
      turns.push({ message: t.message, ok: true, latencyMs, mode: res.value.assistantMessage.mode ?? undefined, result: r, flags, constraintResults, context: ctx, sports: sp } as TurnLog);
      prev = r;
      if (paceMs) await new Promise((ok) => setTimeout(ok, paceMs));
    }
    logs.push({ c, turns });
  }

  // ---------- Report ----------
  const all = logs.flatMap((l) => l.turns);
  const passed = all.filter((t) => t.ok);
  const lat = passed.map((t) => t.latencyMs).sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
  const constraintAll = all.flatMap((t) => t.constraintResults);
  const lines: string[] = [];
  lines.push(`# Caption eval — ${new Date().toISOString()}`, "");
  lines.push(`- Provider: **${providerLabel}**`);
  lines.push(`- Turns: ${all.length} · passed validation: ${passed.length} · failed: ${all.length - passed.length}`);
  lines.push(`- Latency: median ${(median / 1000).toFixed(1)}s · max ${((lat.at(-1) ?? 0) / 1000).toFixed(1)}s`);
  lines.push(`- Constraint checks: ${constraintAll.filter((x) => x.startsWith("PASS")).length}/${constraintAll.length} passed`);
  lines.push(`- Quality flags (automatic heuristics, review by hand): ${passed.reduce((n, t) => n + t.flags.length, 0)}`, "");
  lines.push("| Case | Turn | OK | Latency | Flags | Constraints |", "|---|---|---|---|---|---|");
  for (const { c, turns } of logs) {
    turns.forEach((t, i) =>
      lines.push(`| ${c.title} | ${i + 1}: ${t.message.replace(/\n/g, " ").slice(0, 40).replace(/\|/g, "/")} | ${t.ok ? "✅" : "❌"} | ${(t.latencyMs / 1000).toFixed(1)}s | ${t.ok ? t.flags.join("; ") || "—" : t.error} | ${t.constraintResults.join("; ") || "—"} |`),
    );
  }
  for (const { c, turns } of logs) {
    lines.push("", `## ${c.title}`);
    turns.forEach((t, i) => {
      lines.push("", `### Turn ${i + 1}: ${t.message.split("\n")[0]}`);
      if (!t.ok || !t.result) {
        lines.push("", `**Failed:** ${t.error}`);
        return;
      }
      const r = t.result;
      lines.push("", `*Mode: ${t.mode} · ${(t.latencyMs / 1000).toFixed(1)}s · context: platform=${t.context?.platform}, language=${t.context?.language}, tone=${t.context?.tone}, length=${t.context?.length}, emoji=${t.context?.emoji}*`);
      lines.push("", `**Summary:** ${r.topicSummary}`);
      const sp = (t as TurnLog & { sports?: unknown }).sports as { match?: { homeName: string; awayName: string; stage: string } | null; question?: { alias: string | null } | null } | undefined;
      if (sp?.match) lines.push("", `**Match:** ${sp.match.homeName} vs ${sp.match.awayName} · stage ${sp.match.stage}`);
      if (sp?.question) lines.push("", `**Question asked:** which "${sp.question.alias}"?`);
      if (r.platforms.length) {
        for (const p of r.platforms) {
          lines.push("", `#### ${p.platform}`);
          for (const o of p.options) {
            const body = [o.title && `TITLE: ${o.title}`, o.description && `DESCRIPTION: ${o.description}`, o.caption].filter(Boolean).join("\n");
            lines.push("", `**${o.kind}${o.kind === p.recommended ? " (recommended)" : ""}** — ${o.why}`, "", "```", body, o.hashtags.join(" "), "```");
          }
        }
      } else {
        for (const v of r.variants) {
          lines.push("", `**Option ${v.id} — ${v.approach}${v.id === r.recommendedVariantId ? " (recommended)" : ""}**`, "", "```", v.caption, v.hashtags.join(" "), "```");
        }
      }
      lines.push("", `**Why recommended:** ${r.recommendationReason}`);
      lines.push("", `**Hooks:** ${r.hooks.map((h) => `“${h}”`).join(" · ") || "—"}`);
      lines.push("", `**Hashtag suggestions:** ${r.hashtagSuggestions.map((h) => h.tag).join(" ") || "—"}`);
      if (r.assumptions.length) lines.push("", `**Assumptions:** ${r.assumptions.join(" ")}`);
      if (r.limitations.length) lines.push("", `**Limitations:** ${r.limitations.join(" ")}`);
      if (t.flags.length) lines.push("", `**Flags:** ${t.flags.join("; ")}`);
      if (t.constraintResults.length) lines.push("", `**Constraints:** ${t.constraintResults.join("; ")}`);
    });
  }

  const dir = path.join(process.cwd(), "eval-output");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `captions-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`\nReport: ${file}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
