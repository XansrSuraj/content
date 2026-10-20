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
}

const PASTED = "Aaj ka vlog: maine ghar pe pehli baar pizza banaya 🍕\nOven nahi tha toh kadhai mein try kiya. Result dekh ke batao kaisa laga!";

const CASES: Case[] = [
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
  const [u] = await db.insert(users).values({ email: `eval-${Date.now()}@eval.local` }).returning();
  const user = { id: u.id, email: u.email, role: u.role, isDemo: false };
  const provider = getCaptionProvider();
  const status = aiStatus();
  const providerLabel =
    status.kind === "live" ? `Anthropic (${status.model})` : status.kind === "local" ? `Ollama (${status.model}) — local development model` : "Template preview (no AI)";
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
      console.log(`ok ${latencyMs}ms${flags.length ? ` · ${flags.length} flag(s)` : ""}${constraintResults.length ? ` · ${constraintResults.join("; ")}` : ""}`);
      turns.push({ message: t.message, ok: true, latencyMs, mode: res.value.assistantMessage.mode ?? undefined, result: r, flags, constraintResults, context: ctx });
      prev = r;
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
      for (const v of r.variants) {
        lines.push("", `**Option ${v.id} — ${v.approach}${v.id === r.recommendedVariantId ? " (recommended)" : ""}**`, "", "```", v.caption, v.hashtags.join(" "), "```");
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
