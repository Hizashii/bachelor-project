// Checks the real configuration before the first live test, without changing any data.
// Run with: npm run check:setup

import { mkdir } from "node:fs/promises";
import { loadApiEnvironment } from "../config/env.ts";
import { createDatabase, verifyDatabase } from "../db/pool.ts";
import { MicrosoftGraphClient } from "../storage/graphClient.ts";
import { resolveLocalStorageRoot } from "../storage/localStorage.ts";
import { DEFAULT_METADATA_FIELDS } from "../storage/sharepointStorage.ts";

type Environment = ReturnType<typeof loadApiEnvironment>;
type Check = { name: string; run: () => Promise<string> };

async function checkDatabase(environment: Environment): Promise<string> {
  const database = createDatabase(environment.DATABASE_URL);
  try {
    await verifyDatabase(database);
    const { rows } = await database.query<{ count: string }>(
      `SELECT count(*) FROM organization_memberships m
       JOIN user_accounts u ON u.id = m.user_account_id
       WHERE m.role = 'master' AND m.status = 'active' AND u.status = 'active'`,
    );
    const admins = Number(rows[0]?.count ?? 0);
    if (admins === 0)
      throw new Error("No active administrator yet. Run npm run admin:create.");
    return `connected, tables present, ${admins} active administrator(s)`;
  } finally {
    await database.end();
  }
}

async function checkSharePoint(environment: Environment): Promise<string> {
  const graph = new MicrosoftGraphClient({
    tenantId: environment.SHAREPOINT_TENANT_ID ?? "",
    clientId: environment.SHAREPOINT_CLIENT_ID ?? "",
    clientSecret: environment.SHAREPOINT_CLIENT_SECRET ?? "",
    maxRetries: 0,
  });
  const probe = await graph.probe(
    environment.SHAREPOINT_DRIVE_ID ?? "",
    environment.SHAREPOINT_ROOT_ITEM_ID ?? "",
    Object.values(DEFAULT_METADATA_FIELDS),
  );
  if (probe.missingColumns.length > 0) {
    throw new Error(
      `Library columns missing: ${probe.missingColumns.join(", ")}`,
    );
  }
  return `folder "${probe.rootFolder}" reachable, all library columns present`;
}

async function checkStorage(environment: Environment): Promise<string> {
  if (environment.STORAGE_MODE === "local") {
    const root = resolveLocalStorageRoot(environment.LOCAL_STORAGE_DIR);
    await mkdir(root, { recursive: true });
    return `local folder ready (${root})`;
  }
  return checkSharePoint(environment);
}

let environment: Environment;
try {
  environment = loadApiEnvironment();
} catch (error) {
  console.error(
    `✗ Settings: ${error instanceof Error ? error.message : "invalid"}`,
  );
  process.exit(1);
}

const checks: Check[] = [
  {
    name: "Settings",
    run: async () => "valid",
  },
  { name: "PostgreSQL", run: () => checkDatabase(environment) },
  { name: "Storage", run: () => checkStorage(environment) },
];

let failed = false;
for (const check of checks) {
  try {
    console.log(`✓ ${check.name}: ${await check.run()}`);
  } catch (error) {
    failed = true;
    console.error(
      `✗ ${check.name}: ${error instanceof Error ? error.message : "failed"}`,
    );
  }
}
process.exit(failed ? 1 : 0);
