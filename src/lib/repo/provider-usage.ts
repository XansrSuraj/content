import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { providerUsage } from "@/lib/db/schema";

const dayKey = (d: Date) => `d:${d.toISOString().slice(0, 10)}`;
const minuteKey = (d: Date) => `m:${d.toISOString().slice(0, 16)}`;

export interface Budget {
  perDay: number;
  perMinute: number;
}

/**
 * Reserves `n` calls against a provider's daily and per-minute budget, shared by
 * every user. Returns false (and reserves nothing) when either window would be exceeded.
 */
export async function reserveCalls(db: DB, provider: string, n: number, budget: Budget, now = new Date()): Promise<{ ok: boolean; dayUsed: number; minuteUsed: number }> {
  const keys = [dayKey(now), minuteKey(now)];
  const rows = await db.select().from(providerUsage).where(and(eq(providerUsage.provider, provider), inArray(providerUsage.window, keys)));
  const dayUsed = rows.find((r) => r.window === keys[0])?.calls ?? 0;
  const minuteUsed = rows.find((r) => r.window === keys[1])?.calls ?? 0;
  if (dayUsed + n > budget.perDay || minuteUsed + n > budget.perMinute) return { ok: false, dayUsed, minuteUsed };
  for (const window of keys) {
    await db
      .insert(providerUsage)
      .values({ provider, window, calls: n })
      .onConflictDoUpdate({ target: [providerUsage.provider, providerUsage.window], set: { calls: sql`${providerUsage.calls} + ${n}` } });
  }
  // Old minute rows are only needed for the current minute.
  await db.delete(providerUsage).where(and(eq(providerUsage.provider, provider), like(providerUsage.window, "m:%"), lt(providerUsage.window, keys[1])));
  return { ok: true, dayUsed: dayUsed + n, minuteUsed: minuteUsed + n };
}

export async function usageToday(db: DB, now = new Date()): Promise<Map<string, number>> {
  const rows = await db.select().from(providerUsage).where(eq(providerUsage.window, dayKey(now)));
  return new Map(rows.map((r) => [r.provider, r.calls]));
}
