import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/** Fresh in-memory Postgres (PGlite) with real migrations applied. */
export async function createTestDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  return db as unknown as DB;
}

export async function createUser(db: DB, email: string, opts: { isDemo?: boolean; role?: "creator" | "admin" } = {}) {
  const [u] = await db
    .insert(schema.users)
    .values({ email, isDemo: opts.isDemo ?? false, role: opts.role ?? "creator" })
    .returning();
  return { id: u.id, email: u.email, role: u.role, isDemo: u.isDemo };
}
