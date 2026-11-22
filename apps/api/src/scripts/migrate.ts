// Applies the database migrations. Run with: npm run db:migrate

import { loadApiEnvironment } from "../config/env.ts";
import { applyMigrations } from "../db/migrate.ts";
import { createDatabase } from "../db/pool.ts";

const { DATABASE_URL } = loadApiEnvironment();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const database = createDatabase(DATABASE_URL);
try {
  const applied = await applyMigrations(database);
  console.log(
    applied.length > 0
      ? `Applied: ${applied.join(", ")}`
      : "The database is already up to date.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
} finally {
  await database.end();
}
