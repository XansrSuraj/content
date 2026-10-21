import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { apiError, json } from "@/lib/api";
import { safeEqual } from "@/lib/auth/password";
import { runAllEnabled } from "@/lib/jobs/ingest";
import { SPORTS_KEYS, buildSportsConnector, runSportsIngestion } from "@/lib/jobs/sports-ingest";
import { cleanupOldDemoUsers } from "@/lib/demo/seed";
import { refreshStandingsIfStale } from "@/lib/jobs/standings";
import { listStandings } from "@/lib/repo/standings";

export const maxDuration = 120;

/**
 * Scheduler entry point: POST with `Authorization: Bearer $INGEST_SECRET`.
 * Disabled entirely unless INGEST_SECRET (>= 32 chars) is configured.
 */
export async function POST(req: Request) {
  const cfg = config();
  if (!cfg.ingestSecretPresent) return apiError(404, "not_found", "Not found.");
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, process.env.INGEST_SECRET!)) return apiError(401, "unauthorized", "Invalid token.");
  const url = new URL(req.url);
  const db = await getDb();
  const results = await runAllEnabled(db, cfg, { trigger: "scheduled", force: url.searchParams.get("force") === "1" });
  const sports = [];
  for (const key of SPORTS_KEYS) {
    const c = buildSportsConnector(key, cfg);
    if (c) sports.push(await runSportsIngestion(db, c, { force: url.searchParams.get("force") === "1" }));
  }
  await refreshStandingsIfStale(db).catch(() => undefined);
  const standings = (await listStandings(db)).map((s) => ({ competition: s.competitionCode, teams: s.rows.length, fetchedAt: s.fetchedAt }));
  const demoCleaned = await cleanupOldDemoUsers(db);
  return json({ results, sports, standings, demoCleaned });
}

/** Vercel Cron and similar schedulers issue GET with the same Bearer header. */
export const GET = POST;
