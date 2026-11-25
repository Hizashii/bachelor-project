// Creates local sign-in accounts for development: one staff user and three carriers.
// It adds no tenders, bids or files. Running it again changes nothing.
// Run with: npm run seed:users

import { hashPassword } from "../auth/password.ts";
import { loadApiEnvironment } from "../config/env.ts";
import { Accounts } from "../db/accounts.ts";
import { CredentialStore } from "../db/credentials.ts";
import { applyMigrations } from "../db/migrate.ts";
import { createDatabase, verifyDatabase } from "../db/pool.ts";

type Carrier = { name: string; email: string; password: string };

const STAFF = {
  email: "staff@freight.local",
  displayName: "S&A Staff",
  password: "Staff-Local-2026!",
};

const CARRIERS: Carrier[] = [
  {
    name: "Test Carrier North ApS",
    email: "north@freight.local",
    password: "North-Local-2026!",
  },
  {
    name: "Test Carrier South ApS",
    email: "south@freight.local",
    password: "South-Local-2026!",
  },
  {
    name: "Test Carrier East ApS",
    email: "east@freight.local",
    password: "East-Local-2026!",
  },
];

async function ensureCarrier(accounts: Accounts, name: string) {
  const found = (await accounts.listCarriers()).find(
    (carrier) => carrier.displayName === name,
  );
  return found?.id ?? (await accounts.createCarrier(name, name)).id;
}

async function ensureUser(
  accounts: Accounts,
  credentials: CredentialStore,
  input: {
    email: string;
    displayName: string;
    password: string;
    role: "master" | "carrier";
    carrierId?: string;
  },
): Promise<void> {
  const existing = (await accounts.listUsers()).find(
    (user) => user.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (existing) return;
  const { password, ...account } = input;
  const created = await accounts.createUser(account);
  await credentials.setPassword(created.id, await hashPassword(password));
}

async function seed(): Promise<void> {
  const database = createDatabase(loadApiEnvironment().DATABASE_URL);
  try {
    await applyMigrations(database);
    await verifyDatabase(database);
    const accounts = new Accounts(database);
    const credentials = new CredentialStore(database);
    await ensureUser(accounts, credentials, { ...STAFF, role: "master" });
    for (const carrier of CARRIERS) {
      await ensureUser(accounts, credentials, {
        email: carrier.email,
        displayName: carrier.name,
        password: carrier.password,
        role: "carrier",
        carrierId: await ensureCarrier(accounts, carrier.name),
      });
    }
    console.log(`Staff: ${STAFF.email} / ${STAFF.password}`);
    for (const c of CARRIERS)
      console.log(`Carrier: ${c.email} / ${c.password}`);
  } finally {
    await database.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
