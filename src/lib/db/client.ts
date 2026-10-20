import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * One data-access entry point for every environment:
 * - DATABASE_URL=postgres://...  -> node-postgres (production / shared Postgres or Supabase)
 * - DATABASE_URL unset           -> embedded PGlite in ./.data/pglite (local dev, demo)
 * - DATABASE_URL=memory://       -> in-memory PGlite (tests)
 * PGlite is real Postgres compiled to WASM, so the same schema and migrations apply.
 */
export type DB = NodePgDatabase<typeof schema>;

type Holder = { db: Promise<DB> | null; close: (() => Promise<void>) | null };
const g = globalThis as unknown as { __trendsaathiDb?: Holder };
const holder: Holder = (g.__trendsaathiDb ??= { db: null, close: null });

const MIGRATIONS = path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

async function connect(url: string | undefined): Promise<DB> {
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" },
    });
    holder.close = () => pool.end();
    // Production migrations are an explicit step (npm run db:migrate), never implicit.
    return drizzle(pool, { schema });
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir =
    url === "memory://" ? undefined : path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DATA_DIR ?? ".data/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  holder.close = () => client.close();
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!holder.db) {
    holder.db = connect(process.env.DATABASE_URL).catch((err) => {
      holder.db = null;
      throw err;
    });
  }
  return holder.db;
}

export async function closeDb(): Promise<void> {
  if (holder.close) await holder.close();
  holder.db = null;
  holder.close = null;
}

export { schema };
