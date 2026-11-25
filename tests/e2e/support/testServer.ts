// Local server for browser tests only. It runs the real app on a throwaway PostgreSQL
// (TEST_DATABASE_URL) with filesystem storage, creates a few users and seeds one active
// tariff. It is never used outside tests.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApi } from "../../../apps/api/src/app.ts";
import { hashPassword } from "../../../apps/api/src/auth/password.ts";
import { permissions } from "../../../apps/api/src/auth/permissions.ts";
import { loadApiEnvironment } from "../../../apps/api/src/config/env.ts";
import { Accounts } from "../../../apps/api/src/db/accounts.ts";
import { CredentialStore } from "../../../apps/api/src/db/credentials.ts";
import { Documents } from "../../../apps/api/src/storage/documents.ts";
import { LocalStorageAdapter } from "../../../apps/api/src/storage/localStorage.ts";
import { TariffService } from "../../../apps/api/src/tariffs/service.ts";
import { freshDatabase } from "../../../apps/api/src/testing/testDatabase.ts";

export const E2E_PASSWORD = "correct horse battery staple";
const apiPort = process.env.E2E_API_PORT ?? "3100";
const appOrigin = process.env.E2E_APP_ORIGIN ?? "http://127.0.0.1:5178";

const environment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: appOrigin,
  API_ORIGIN: `http://127.0.0.1:${apiPort}`,
  API_PORT: apiPort,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  LOGIN_ATTEMPTS_PER_MINUTE: "1000",
  REQUESTS_PER_MINUTE: "10000",
});

const database = await freshDatabase();
const accounts = new Accounts(database);
const credentials = new CredentialStore(database);
const storageRoot =
  process.env.E2E_STORAGE_ROOT ??
  (await mkdtemp(join(tmpdir(), "freight-desk-e2e-")));
const storage = new LocalStorageAdapter(storageRoot);
await storage.ensureInitialFolders();
const tariffs = new TariffService({
  documents: new Documents(storage),
  permissions,
});

const carrier = await accounts.createCarrier("Blue Fjord ApS", "Blue Fjord");
const secondCarrier = await accounts.createCarrier(
  "Second Haul ApS",
  "Second Haul",
);
for (const user of [
  { email: "staff@example.test", role: "master" as const },
  {
    email: "dana@bluefjord.test",
    role: "carrier" as const,
    carrierId: carrier.id,
  },
  {
    email: "erik@secondhaul.test",
    role: "carrier" as const,
    carrierId: secondCarrier.id,
  },
]) {
  const created = await accounts.createUser({
    ...user,
    displayName: user.email,
  });
  await credentials.setPassword(created.id, await hashPassword(E2E_PASSWORD));
}

const admin = {
  userId: "seed",
  organisationId: "slinkert-aaroe",
  role: "master",
} as const;

const seed = {
  tariffId: "t-seed",
  version: 1,
  carrierOrganisationId: carrier.id,
  status: "draft",
  currency: "DKK",
  method: "per_100kg",
  postcodeLength: 4,
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
  zones: [{ id: "z1", name: "Zone A", ranges: [{ from: "00", to: "99" }] }],
  brackets: [{ from: 0, to: null }],
  rates: [{ zoneId: "z1", bracketIndex: 0, amountMinor: 20000 }],
  quantityStep: null,
  minimumChargeMinor: null,
  roundingStepMinor: 1,
  discounts: [],
  surcharges: [],
  restrictions: {
    maxWeightKg: null,
    maxPallets: null,
    maxLoadingMeters: null,
    maxCubicMeters: null,
    originRanges: [],
  },
  sourceFile: null,
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "seed",
  submittedAt: null,
  approvedAt: null,
  approvedBy: null,
} as const;

const saved = await tariffs.saveDraft(admin, seed as never);
await tariffs.submit(admin, saved.tariff);
await tariffs.approve(admin, saved.tariff);
await tariffs.activateVersion(admin, saved.tariff);

await buildApi({ environment, database, storage }).listen({
  port: environment.API_PORT,
  host: "127.0.0.1",
});
