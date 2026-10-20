/** Seeds (or refreshes) the clearly labeled demo catalogue. Demo users are created on "Try the demo". */
import { closeDb, getDb } from "../src/lib/db/client";
import { ensureDemoCatalog } from "../src/lib/demo/seed";

async function main() {
  const db = await getDb();
  await ensureDemoCatalog(db, new Date());
  await closeDb();
  console.log("Demo catalogue ready.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
