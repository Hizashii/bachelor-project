// Creates local sign-in accounts for development: one staff user and three carriers.
// It adds no tenders, bids or files. Running it again changes nothing.
// Run with: npm run seed:users

import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth/password.ts";
import { loadApiEnvironment } from "../config/env.ts";
import { Accounts } from "../db/accounts.ts";
import { CredentialStore } from "../db/credentials.ts";
import { applyMigrations } from "../db/migrate.ts";
import { createDatabase, verifyDatabase } from "../db/pool.ts";

type Account = { name: string; email: string };

const STAFF: Account = { name: "S&A Staff", email: "staff@freight.local" };

const CARRIERS: Account[] = [
  { name: "Test Carrier North ApS", email: "north@freight.local" },
  { name: "Test Carrier South ApS", email: "south@freight.local" },
  { name: "Test Carrier East ApS", email: "east@freight.local" },
];

const PASSWORD_BYTES = 12;

// A new random password is made for each account and shown once; none is stored in code.
const newPassword = () =>
  `${randomBytes(PASSWORD_BYTES).toString("base64url")}-1aA`;

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
    role: "master" | "carrier";
    carrierId?: string;
  },
): Promise<void> {
  const existing = (await accounts.listUsers()).find(
    (user) => user.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (existing) {
    console.log(`${input.email}: already exists, password unchanged`);
    return;
  }
  const password = newPassword();
  const created = await accounts.createUser(input);
  await credentials.setPassword(created.id, await hashPassword(password));
  console.log(`${input.email} / ${password}`);
}

async function seed(): Promise<void> {
  const environment = loadApiEnvironment();
  if (environment.NODE_ENV === "production") {
    throw new Error("seed:users is for local development only.");
  }
  const database = createDatabase(environment.DATABASE_URL);
  try {
    await applyMigrations(database);
    await verifyDatabase(database);
    const accounts = new Accounts(database);
    const credentials = new CredentialStore(database);
    await ensureUser(accounts, credentials, {
      email: STAFF.email,
      displayName: STAFF.name,
      role: "master",
    });
    for (const carrier of CARRIERS) {
      await ensureUser(accounts, credentials, {
        email: carrier.email,
        displayName: carrier.name,
        role: "carrier",
        carrierId: await ensureCarrier(accounts, carrier.name),
      });
    }
  } finally {
    await database.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
