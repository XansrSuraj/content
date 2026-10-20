/** One-off maintenance: removes stored Wikimedia observations that the current filter would reject. */
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/lib/db/client";
import { sourceObservations } from "../src/lib/db/schema";
import { filterArticle } from "../src/lib/providers/trends/wikimedia";

async function main() {
  const db = await getDb();
  const rows = await db.select({ id: sourceObservations.id, externalId: sourceObservations.externalId }).from(sourceObservations).where(eq(sourceObservations.sourceKey, "wikimedia_top_in"));
  const bad = rows.filter((r) => !filterArticle(r.externalId.split(":").slice(1).join(":")));
  if (bad.length) await db.delete(sourceObservations).where(inArray(sourceObservations.id, bad.map((b) => b.id)));
  console.log(`Removed ${bad.length} of ${rows.length} Wikimedia observations.`);
  await closeDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
