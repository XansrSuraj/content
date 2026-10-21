import type { DB } from "@/lib/db/client";
import { FootballDataProvider, STANDINGS_CODES } from "@/lib/providers/sports/connectors";
import { reserveCalls } from "@/lib/repo/provider-usage";
import { listStandings, saveStandings } from "@/lib/repo/standings";

/** Tables change once per matchday, so every 6 hours is plenty (6 competitions → 24 calls/day). */
export const STANDINGS_MAX_AGE_MS = 6 * 3_600_000;

let inflight: Promise<void> | null = null;

/**
 * Refreshes stale league tables from football-data.org within the shared free-tier budget.
 * A failed or skipped fetch keeps the last good table.
 */
export function refreshStandingsIfStale(db: DB, opts: { now?: Date; env?: { FOOTBALL_DATA_TOKEN?: string }; fetchTimeoutMs?: number } = {}): Promise<void> {
  if (inflight) return inflight;
  inflight = run(db, opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(db: DB, opts: { now?: Date; env?: { FOOTBALL_DATA_TOKEN?: string }; fetchTimeoutMs?: number }): Promise<void> {
  const token = (opts.env ?? process.env).FOOTBALL_DATA_TOKEN?.trim();
  if (!token) return;
  const now = opts.now ?? new Date();
  const provider = new FootballDataProvider(token);
  const fresh = new Map((await listStandings(db)).map((s) => [s.competitionCode, s.fetchedAt.getTime()]));
  for (const code of STANDINGS_CODES) {
    if (now.getTime() - (fresh.get(code) ?? 0) < STANDINGS_MAX_AGE_MS) continue;
    const quota = await reserveCalls(db, provider.key, 1, provider.budget, now);
    if (!quota.ok) return;
    try {
      const table = await provider.standings(code, AbortSignal.timeout(opts.fetchTimeoutMs ?? 15_000));
      if (table) await saveStandings(db, provider.key, table, now);
    } catch {
      // Keep the last good table; the next refresh retries.
    }
  }
}
