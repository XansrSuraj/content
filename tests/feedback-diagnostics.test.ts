import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events, sources } from "@/lib/db/schema";
import { runCaptionTurn } from "@/lib/services/captions";
import { CaptionResultSchema } from "@/lib/domain/captions";
import { messageOwnedBy } from "@/lib/repo/studio";
import { reserveCalls } from "@/lib/repo/provider-usage";
import { providerStatus } from "@/lib/services/status";
import { resetConfigCache } from "@/lib/config";
import type { CaptionProvider } from "@/lib/providers/ai/types";
import { createTestDb, createUser } from "./helpers";
import { sampleModelOutput } from "./fixtures";

const provider: CaptionProvider = {
  name: "rec",
  async generate() {
    return { data: CaptionResultSchema.parse(sampleModelOutput()), mode: "open_model", usage: { inputTokens: 1, outputTokens: 1, model: "m" } };
  },
};

describe("feedback events", () => {
  it("records generation and corrections with ids only — never caption text", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "ev1@example.com");
    const caption = "RCB vs MI preview, secret phrase xyz";
    const first = await runCaptionTurn(db, user, { conversationId: null, message: caption, opportunityId: null }, provider);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await runCaptionTurn(db, user, { conversationId: first.value.conversationId, message: "Regenerate", opportunityId: null, context: { intentOverride: "recap" } }, provider);
    const rows = await db.select().from(events).where(eq(events.userId, user.id));
    const types = rows.map((r) => r.type);
    expect(types.filter((t) => t === "generation_succeeded")).toHaveLength(2);
    expect(rows.find((r) => r.type === "match_corrected")?.payload).toMatchObject({ field: "intentOverride" });
    const gen = rows.find((r) => r.type === "generation_succeeded")!.payload;
    expect(gen).toMatchObject({ messageId: first.value.assistantMessage.id, repairs: 0, matchAttached: false });
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toMatch(/secret phrase|RCB vs MI/);
  });

  it("client events are only accepted for the creator's own answers", async () => {
    const db = await createTestDb();
    const a = await createUser(db, "ev-a@example.com");
    const b = await createUser(db, "ev-b@example.com");
    const res = await runCaptionTurn(db, a, { conversationId: null, message: "Hello", opportunityId: null }, provider);
    if (!res.ok) throw new Error("turn failed");
    expect(await messageOwnedBy(db, a.id, res.value.assistantMessage.id)).toBe(true);
    expect(await messageOwnedBy(db, b.id, res.value.assistantMessage.id)).toBe(false);
  });
});

describe("admin diagnostics", () => {
  it("reports failures, circuit state, latency and quota without secrets", async () => {
    const db = await createTestDb();
    const paused = new Date(Date.now() + 30 * 60_000);
    await db.insert(sources).values({ key: "openligadb", name: "OpenLigaDB", consecutiveFailures: 3, pausedUntil: paused, lastLatencyMs: 812, lastFailureAt: new Date() });
    await reserveCalls(db, "openligadb", 4, { perDay: 120, perMinute: 10 });
    // Plant fake key values: diagnostics may name a setting but must never show its value.
    process.env.CRICAPI_KEY = "planted-cricapi-value-0001";
    process.env.FOOTBALL_DATA_TOKEN = "planted-fd-value-0002";
    resetConfigCache();
    const st = await providerStatus(db);
    delete process.env.CRICAPI_KEY;
    delete process.env.FOOTBALL_DATA_TOKEN;
    resetConfigCache();
    const s = st.sources.find((x) => x.key === "openligadb")!;
    expect(s).toMatchObject({ consecutiveFailures: 3, lastLatencyMs: 812, quota: { used: 4, perDay: 120 } });
    expect(s.pausedUntil?.getTime()).toBe(paused.getTime());
    expect(JSON.stringify(st)).not.toMatch(/planted-/);
    expect(st.sources.find((x) => x.key === "cricapi")?.status).toBe("enabled");
  });
});
