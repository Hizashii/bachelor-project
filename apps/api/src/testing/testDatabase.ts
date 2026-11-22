// A throwaway PostgreSQL schema for tests. Set TEST_DATABASE_URL to a database that may
// be wiped (never a real one). Without it the database tests are skipped on a developer
// machine and fail in CI, so a missing database can never look like a green run.

import { applyMigrations } from "../db/migrate.ts";
import { createDatabase } from "../db/pool.ts";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  if (process.env.CI) throw new Error("TEST_DATABASE_URL must be set in CI.");
  console.warn(
    "TEST_DATABASE_URL is not set: account and sign-in tests are skipped.",
  );
}

export async function freshDatabase() {
  const database = createDatabase(testDatabaseUrl ?? "");
  await database.query("DROP SCHEMA public CASCADE");
  await database.query("CREATE SCHEMA public");
  await applyMigrations(database);
  return database;
}
