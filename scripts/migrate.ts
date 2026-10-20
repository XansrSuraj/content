/** Applies drizzle/ migrations to DATABASE_URL (Postgres) or the local PGlite directory. */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" } });
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.end();
    console.log("Postgres migrations applied.");
  } else {
    const { getDb, closeDb } = await import("../src/lib/db/client");
    await getDb(); // PGlite migrates on connect
    await closeDb();
    console.log(`PGlite migrations applied (${process.env.PGLITE_DATA_DIR ?? ".data/pglite"}).`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
