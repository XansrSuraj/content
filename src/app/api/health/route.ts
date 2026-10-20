import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { json } from "@/lib/api";
import { providerStatus } from "@/lib/services/status";

/** Liveness + readiness for hosts (Render health check, uptime monitors). No secrets, no user data. */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    const status = await providerStatus(db);
    return json({
      ok: true,
      db: process.env.DATABASE_URL?.startsWith("postgres") ? "postgres" : "embedded",
      ai: status.ai.kind === "not_configured" ? { kind: "not_configured" } : { kind: status.ai.kind, model: status.ai.model },
      demo: config().demoEnabled,
      sources: status.sources.filter((s) => s.status === "enabled").map((s) => ({ key: s.key, stale: s.stale })),
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    console.error("[health] failed:", err instanceof Error ? err.message : String(err));
    return json({ ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "unknown" }, 503);
  }
}
