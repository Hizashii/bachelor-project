// Local server for browser tests only. It runs the real app with mock sign-in and an
// in-memory storage, and seeds one active tariff. It is never used outside tests.

import { buildApi } from "../../../apps/api/src/app.ts";
import { permissions } from "../../../apps/api/src/auth/permissions.ts";
import { loadApiEnvironment } from "../../../apps/api/src/config/env.ts";
import { Documents } from "../../../apps/api/src/storage/documents.ts";
import { TariffService } from "../../../apps/api/src/tariffs/service.ts";
import { createMemoryStorage } from "../../../apps/api/src/testing/memoryStorage.ts";

const environment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: "http://127.0.0.1:5173",
  API_ORIGIN: "http://127.0.0.1:3000",
  API_PORT: "3000",
  AUTH_MODE: "mock",
});

const storage = createMemoryStorage();
const tariffs = new TariffService({
  documents: new Documents(storage),
  permissions,
});
const admin = {
  userId: "seed",
  organisationId: "slinkert-aaroe",
  role: "master",
} as const;

const seed = {
  tariffId: "t-seed",
  version: 1,
  carrierOrganisationId: "carrier-blue-fjord",
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

await buildApi({ environment, storage }).listen({
  port: environment.API_PORT,
  host: "127.0.0.1",
});
