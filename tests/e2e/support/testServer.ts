// Local server for browser tests only. It wires the real routes and services to an
// in-memory store and one fixed test user. It is never used outside tests.

import Fastify from "fastify";
import { registerFreightRoutes } from "../../../apps/api/src/freight/routes.ts";
import { ImportService } from "../../../apps/api/src/imports/importService.ts";
import { ImportLibrary } from "../../../apps/api/src/imports/library.ts";
import { PricingService } from "../../../apps/api/src/tariffs/pricing.ts";
import { TariffService } from "../../../apps/api/src/tariffs/service.ts";
import {
  createMemoryStore,
  rolePermissions,
} from "../../../apps/api/src/testing/memoryStore.ts";

const PORT = 3000;
const user = {
  userId: "test-user",
  organisationId: "carrier-a",
  role: "master",
} as const;

const store = createMemoryStore();
const tariffs = new TariffService({ store, permissions: rolePermissions });
const imports = new ImportService({ store, permissions: rolePermissions });
const app = Fastify();

registerFreightRoutes(app, {
  getContext: () => user,
  imports,
  library: new ImportLibrary(imports, store),
  tariffs,
  pricing: new PricingService({ tariffs, permissions: rolePermissions }),
});
app.get("/api/session", async () => user);
app.get("/api/carriers", async () => [
  { organisationId: "carrier-a", name: "Test Carrier A", tariffId: "t-seed" },
]);

const seed = {
  tariffId: "t-seed",
  version: 1,
  carrierOrganisationId: "carrier-a",
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
  createdBy: "test-user",
  submittedAt: null,
  approvedAt: null,
  approvedBy: null,
} as const;

const saved = await tariffs.saveDraft(user, seed as never);
await tariffs.submit(user, saved.tariff);
await tariffs.approve(user, saved.tariff);
await tariffs.activateVersion(user, saved.tariff);

await app.listen({ port: PORT, host: "127.0.0.1" });
