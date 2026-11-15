// Applies the numbered database/migrations/*.up.sql files once each, in order.
// It is run on purpose (npm run db:migrate); the app never migrates at start-up.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Database } from "./pool.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../database/migrations/", import.meta.url),
);

export async function applyMigrations(
  database: Database,
  folder = MIGRATIONS_FOLDER,
): Promise<string[]> {
  await database.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const done = await database.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  const applied = new Set(done.rows.map((row) => row.name));
  const files = (await readdir(folder))
    .filter((name) => name.endsWith(".up.sql"))
    .sort();
  const newlyApplied: string[] = [];
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(`${folder}${name}`, "utf8");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        name,
      ]);
      await client.query("COMMIT");
      newlyApplied.push(name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return newlyApplied;
}
