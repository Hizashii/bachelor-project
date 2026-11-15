// The PostgreSQL connection for account, organisation and membership data only.
// Freight data never goes here. Connection details come from DATABASE_URL.

import pg from "pg";

export type Database = Pick<pg.Pool, "query" | "connect" | "end">;

const CONNECT_TIMEOUT_MS = 5000;
const REQUIRED_TABLES = [
  "organizations",
  "user_accounts",
  "organization_memberships",
  "user_tokens",
  "user_sessions",
];

export class DatabaseUnavailableError extends Error {}

export function createDatabase(url: string): pg.Pool {
  return new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
}

// Fails with a plain message (never the connection string) if the database cannot be
// reached or the migrations have not been applied.
export async function verifyDatabase(database: Database): Promise<void> {
  try {
    const { rows } = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [REQUIRED_TABLES],
    );
    const found = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
    if (missing.length > 0) {
      throw new DatabaseUnavailableError(
        `The database is missing tables (${missing.join(", ")}). Run npm run db:migrate.`,
      );
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    throw new DatabaseUnavailableError(
      "The database cannot be reached. Check DATABASE_URL and that PostgreSQL is running.",
    );
  }
}
