/**
 * Local/CLI ingestion job.
 *
 *   npm run ingest                 # uses DATABASE_URL Postgres directly
 *   npm run ingest -- --force      # ignore the per-source minimum interval
 *   npm run ingest -- --via-http   # call the running app's /api/jobs/ingest (needed with PGlite while `npm run dev` is running)
 *
 * PGlite (no DATABASE_URL) is single-process: stop the dev server first, or use --via-http.
 */
import { readConfig } from "../src/lib/config";
import { closeDb, getDb } from "../src/lib/db/client";
import { runAllEnabled } from "../src/lib/jobs/ingest";

const args = new Set(process.argv.slice(2));

async function main() {
  const force = args.has("--force");
  if (args.has("--via-http")) {
    const secret = process.env.INGEST_SECRET;
    if (!secret || secret.length < 32) throw new Error("INGEST_SECRET (>= 32 chars) is required for --via-http.");
    const base = process.env.APP_URL || "http://localhost:3000";
    const res = await fetch(`${base}/api/jobs/ingest${force ? "?force=1" : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(180_000),
    });
    console.log(res.status, JSON.stringify(await res.json(), null, 2));
    return;
  }
  const cfg = readConfig();
  const db = await getDb();
  const results = await runAllEnabled(db, cfg, { trigger: "cli", force });
  for (const r of results) {
    console.log(`${r.sourceKey}: ${r.status} fetched=${r.itemsFetched} new=${r.itemsNew} purged=${r.purged}${r.error ? ` error=${r.error}` : ""}`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
