import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";

export interface LimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in Postgres, so limits hold across server
 * instances. A single atomic upsert increments or resets the window.
 */
export async function consumeLimit(
  db: DB,
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<LimitResult> {
  const windowStartCutoff = new Date(now.getTime() - windowMs);
  const rows = await db.execute<{ count: number; window_start: string | Date }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, ${now.toISOString()}, 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < ${windowStartCutoff.toISOString()} then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < ${windowStartCutoff.toISOString()} then ${now.toISOString()}::timestamptz else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows.rows[0];
  const count = Number(row.count);
  const start = new Date(row.window_start);
  const retryAfterSeconds = Math.max(1, Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000));
  return { allowed: count <= limit, count, limit, retryAfterSeconds };
}

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface AiLimits {
  perMinute: number;
  perDay: number;
}

export async function checkAiQuota(
  db: DB,
  userId: string,
  limits: AiLimits,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "minute" | "day"; retryAfterSeconds: number }> {
  const minute = await consumeLimit(db, `ai-min:${userId}`, limits.perMinute, 60_000, now);
  if (!minute.allowed) return { ok: false, reason: "minute", retryAfterSeconds: minute.retryAfterSeconds };
  const day = await consumeLimit(db, `ai-day:${userId}:${dayKey(now)}`, limits.perDay, 86_400_000, now);
  if (!day.allowed) return { ok: false, reason: "day", retryAfterSeconds: day.retryAfterSeconds };
  return { ok: true };
}
