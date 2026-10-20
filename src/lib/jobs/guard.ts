import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { RateLimitedError } from "@/lib/providers/trends/types";

/**
 * Resilience for background refreshes, shared by every source:
 * - a DB lock so the same source never refreshes twice at once (even across instances);
 * - a circuit breaker: after FAILURES_TO_PAUSE consecutive failures the source is paused,
 *   doubling up to MAX_PAUSE; a 429 pauses for exactly its Retry-After;
 * - exponential backoff with jitter between attempts.
 * Good cached data is never touched on failure; only these counters change.
 */

export const FAILURES_TO_PAUSE = 3;
export const BASE_PAUSE_MS = 30 * 60_000;
export const MAX_PAUSE_MS = 6 * 3_600_000;

export async function acquireLock(db: DB, key: string, ttlMs: number, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(sources)
    .set({ lockedUntil: new Date(now.getTime() + ttlMs) })
    .where(and(eq(sources.key, key), or(isNull(sources.lockedUntil), lt(sources.lockedUntil, now))))
    .returning({ key: sources.key });
  return rows.length > 0;
}

export async function releaseLock(db: DB, key: string): Promise<void> {
  await db.update(sources).set({ lockedUntil: null }).where(eq(sources.key, key));
}

export function pausedUntil(row: { pausedUntil: Date | null } | undefined, now: Date): Date | null {
  return row?.pausedUntil && row.pausedUntil.getTime() > now.getTime() ? row.pausedUntil : null;
}

export async function recordSuccess(db: DB, key: string, now: Date, latencyMs: number): Promise<void> {
  await db
    .update(sources)
    .set({ lastRunAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0, pausedUntil: null, lastLatencyMs: latencyMs })
    .where(eq(sources.key, key));
}

/** Pause length after `failures` consecutive failures (none below the threshold). */
export function pauseMs(failures: number): number {
  if (failures < FAILURES_TO_PAUSE) return 0;
  return Math.min(BASE_PAUSE_MS * 2 ** (failures - FAILURES_TO_PAUSE), MAX_PAUSE_MS);
}

export async function recordFailure(db: DB, key: string, now: Date, message: string, latencyMs: number, err?: unknown): Promise<void> {
  const [row] = await db
    .update(sources)
    .set({ lastRunAt: now, lastError: message, lastFailureAt: now, lastLatencyMs: latencyMs, consecutiveFailures: sql`${sources.consecutiveFailures} + 1` })
    .where(eq(sources.key, key))
    .returning({ failures: sources.consecutiveFailures });
  const failures = row?.failures ?? 1;
  const retryAfterMs = err instanceof RateLimitedError && err.retryAfterSeconds !== null ? err.retryAfterSeconds * 1000 : 0;
  const ms = Math.max(retryAfterMs, pauseMs(failures));
  if (ms > 0) await db.update(sources).set({ pausedUntil: new Date(now.getTime() + ms) }).where(eq(sources.key, key));
}

/** Delay before retry `attempt` (1-based): exponential with ±50% jitter. */
export function backoffMs(attempt: number, baseMs = 500, random: () => number = Math.random): number {
  const exp = baseMs * 2 ** (attempt - 1);
  return Math.round(exp * (0.5 + random()));
}

/** True when an error is worth retrying now (429s are not — they wait for Retry-After). */
export function retryable(err: unknown): boolean {
  if (err instanceof RateLimitedError) return false;
  if (err && typeof err === "object" && "retryable" in err) return Boolean((err as { retryable: boolean }).retryable);
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || err.name === "TypeError");
}
