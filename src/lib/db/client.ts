import { readdirSync } from "node:fs";
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

type Holder = {
  db: Promise<DB> | null;
  close: (() => Promise<void>) | null;
  /** Number of migration files applied to the embedded DB in this process. */
  migratedCount?: number;
  migrating?: Promise<void> | null;
};
const g = globalThis as unknown as { __trendsaathiDb?: Holder };
const holder: Holder = (g.__trendsaathiDb ??= { db: null, close: null });

const MIGRATIONS = path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

function isPostgresUrl(url: string | undefined): boolean {
  return Boolean(url && /^postgres(ql)?:\/\//.test(url));
}

function migrationFileCount(): number {
  try {
    return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).length;
  } catch {
    return 0;
  }
}

async function migrateEmbedded(db: DB): Promise<void> {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const count = migrationFileCount();
  await migrate(db as never, { migrationsFolder: MIGRATIONS });
  const { syncSportsSeed } = await import("./sync-sports-seed");
  await syncSportsSeed(db);
  holder.migratedCount = count;
}

async function connect(url: string | undefined): Promise<DB> {
  if (isPostgresUrl(url)) {
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

  // Free hosts have ephemeral disks: an embedded DB there silently loses every account on restart.
  if (process.env.NODE_ENV === "production" && url !== "memory://" && process.env.TRENDSAATHI_ALLOW_EMBEDDED_DB_IN_PRODUCTION !== "true") {
    throw new Error(
      "DATABASE_URL (Postgres) is required in production. Set it to your Neon/Supabase/Postgres connection string, " +
        "or set TRENDSAATHI_ALLOW_EMBEDDED_DB_IN_PRODUCTION=true for a single-machine install with a persistent disk.",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir =
    url === "memory://" ? undefined : path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DATA_DIR ?? ".data/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrateEmbedded(db);
  holder.close = () => client.close();
  return db;
}

export async function getDb(): Promise<DB> {
  if (!holder.db) {
    holder.db = connect(process.env.DATABASE_URL).catch((err) => {
      holder.db = null;
      throw err;
    });
  }
  const db = await holder.db;
  // Embedded DB only: a long-running dev server picks up migrations added after it
  // started, instead of failing on missing columns. Production never migrates implicitly.
  if (!isPostgresUrl(process.env.DATABASE_URL) && holder.migratedCount !== migrationFileCount()) {
    holder.migrating ??= migrateEmbedded(db).finally(() => {
      holder.migrating = null;
    });
    await holder.migrating;
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (holder.close) await holder.close();
  holder.db = null;
  holder.close = null;
  holder.migratedCount = undefined;
}

export { schema };
