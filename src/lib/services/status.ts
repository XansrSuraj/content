import "server-only";
import { aiStatus, config } from "@/lib/config";
import type { DB } from "@/lib/db/client";
import { listSourceRows } from "@/lib/repo/discovery";
import { SOURCES, sourceStatus } from "@/lib/providers/trends/catalog";
import { STALE_AFTER_HOURS } from "@/lib/domain/opportunities";
import { usageToday } from "@/lib/repo/provider-usage";
import { PROVIDER_DAILY_BUDGET } from "@/lib/providers/sports/connectors";

export interface ProviderStatusSummary {
  ai: ReturnType<typeof aiStatus>;
  demoEnabled: boolean;
  sources: {
    key: string;
    name: string;
    status: string;
    missing: string[];
    lastSuccessAt: Date | null;
    lastError: string | null;
    stale: boolean;
    /** Diagnostics (admin): failures, circuit, latency, quota. Never secrets. */
    lastFailureAt: Date | null;
    lastLatencyMs: number | null;
    consecutiveFailures: number;
    pausedUntil: Date | null;
    quota: { used: number; perDay: number } | null;
  }[];
  enabledRealSources: number;
  anyStale: boolean;
}

/** Separates AI-provider status from data-provider status, as shown in the UI. */
export async function providerStatus(db: DB): Promise<ProviderStatusSummary> {
  const cfg = config();
  const rows = new Map((await listSourceRows(db)).map((r) => [r.key, r]));
  const used = await usageToday(db);
  const sources = SOURCES.map((s) => {
    const st = sourceStatus(s.key, cfg);
    const row = rows.get(s.key);
    const last = row?.lastSuccessAt ?? null;
    const stale = st.status === "enabled" && (!last || Date.now() - last.getTime() > STALE_AFTER_HOURS * 3_600_000);
    return {
      key: s.key,
      name: s.name,
      status: st.status,
      missing: st.missing,
      lastSuccessAt: last,
      lastError: row?.lastError ?? null,
      stale,
      lastFailureAt: row?.lastFailureAt ?? null,
      lastLatencyMs: row?.lastLatencyMs ?? null,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      pausedUntil: row?.pausedUntil ?? null,
      quota: PROVIDER_DAILY_BUDGET[s.key] ? { used: used.get(s.key) ?? 0, perDay: PROVIDER_DAILY_BUDGET[s.key] } : null,
    };
  });
  const enabled = sources.filter((s) => s.status === "enabled");
  return {
    ai: aiStatus(cfg),
    demoEnabled: cfg.demoEnabled,
    sources,
    enabledRealSources: enabled.length,
    anyStale: enabled.some((s) => s.stale),
  };
}
