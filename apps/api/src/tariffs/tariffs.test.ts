// Integration tests: tariff draft to active version, then pricing for the comparison.
// Uses in-memory test doubles for storage and permissions. Data is synthetic.

import type { Tariff } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../contracts/access.ts";
import { StorageConflictError } from "../contracts/fileStore.ts";
import { createMemoryStore, rolePermissions } from "../testing/memoryStore.ts";
import { PricingService } from "./pricing.ts";
import {
  TariffAccessError,
  TariffService,
  TariffStateError,
} from "./service.ts";

const carrier: AccessContext = {
  userId: "c1",
  organisationId: "carrier-a",
  role: "carrier",
};
const rival: AccessContext = {
  userId: "c2",
  organisationId: "carrier-b",
  role: "carrier",
};
const staff: AccessContext = {
  userId: "s1",
  organisationId: "sa",
  role: "consultant",
};

const draft: Tariff = {
  tariffId: "t-1",
  version: 1,
  carrierOrganisationId: "carrier-a",
  status: "draft",
  currency: "DKK",
  method: "per_100kg",
  postcodeLength: 4,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  zones: [{ id: "z1", name: "Zone A", ranges: [{ from: "00", to: "99" }] }],
  brackets: [{ from: 0, to: null }],
  rates: [{ zoneId: "z1", bracketIndex: 0, amountMinor: 20_000 }],
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
  sourceFile: "rates.xlsx",
  createdAt: "2026-03-01T10:00:00Z",
  createdBy: "c1",
  submittedAt: null,
  approvedAt: null,
  approvedBy: null,
};

function setup() {
  const store = createMemoryStore();
  const tariffs = new TariffService({ store, permissions: rolePermissions });
  const pricing = new PricingService({ tariffs, permissions: rolePermissions });
  return { store, tariffs, pricing };
}

describe("tariff workflow", () => {
  it("takes a draft through submit, approve and activate, then prices a shipment", async () => {
    const { tariffs, pricing } = setup();
    await tariffs.saveDraft(carrier, draft);
    await tariffs.submit(carrier, draft);
    await tariffs.approve(staff, draft);
    const active = await tariffs.activateVersion(staff, draft);
    expect(active.status).toBe("active");

    const [price] = await pricing.priceCarriers(
      staff,
      [{ organisationId: "carrier-a", tariffId: "t-1" }],
      {
        originPostcode: "8300",
        destinationPostcode: "2680",
        date: "2026-03-05",
        weightKg: 250,
        pallets: null,
        loadingMeters: null,
        cubicMeters: null,
      },
    );
    expect(price?.result).toMatchObject({
      status: "priced",
      totalMinor: 50_000,
    });
  });

  it("refuses to submit an incomplete tariff", async () => {
    const { tariffs } = setup();
    const incomplete = { ...draft, rates: [] };
    await tariffs.saveDraft(carrier, incomplete);
    await expect(tariffs.submit(carrier, incomplete)).rejects.toBeInstanceOf(
      TariffStateError,
    );
  });

  it("keeps a published version unchanged", async () => {
    const { tariffs } = setup();
    await tariffs.saveDraft(carrier, draft);
    await tariffs.submit(carrier, draft);
    const edited = { ...draft, minimumChargeMinor: 1 };
    await expect(tariffs.saveDraft(carrier, edited)).rejects.toBeInstanceOf(
      TariffStateError,
    );
  });

  it("stops a carrier from editing or reading another carrier's tariff", async () => {
    const { tariffs } = setup();
    await tariffs.saveDraft(carrier, draft);
    await expect(tariffs.saveDraft(rival, draft)).rejects.toBeInstanceOf(
      TariffAccessError,
    );
    await expect(
      tariffs.get(rival, "carrier-a", "t-1", 1),
    ).rejects.toBeInstanceOf(TariffAccessError);
  });

  it("does not let a carrier approve its own tariff", async () => {
    const { tariffs } = setup();
    await tariffs.saveDraft(carrier, draft);
    await tariffs.submit(carrier, draft);
    await expect(tariffs.approve(carrier, draft)).rejects.toBeInstanceOf(
      TariffAccessError,
    );
  });

  it("reports a stale editor instead of overwriting newer work", async () => {
    const { tariffs } = setup();
    await tariffs.saveDraft(carrier, draft);
    await tariffs.saveDraft(carrier, { ...draft, minimumChargeMinor: 5 });
    await expect(tariffs.saveDraft(carrier, draft, "1")).rejects.toBeInstanceOf(
      StorageConflictError,
    );
  });

  it("reports no tariff instead of a price when nothing is active", async () => {
    const { tariffs, pricing } = setup();
    await tariffs.saveDraft(carrier, draft);
    const [price] = await pricing.priceCarriers(
      staff,
      [{ organisationId: "carrier-a", tariffId: "t-1" }],
      {
        originPostcode: "8300",
        destinationPostcode: "2680",
        date: "2026-03-05",
        weightKg: 250,
        pallets: null,
        loadingMeters: null,
        cubicMeters: null,
      },
    );
    expect(price?.result).toEqual({ status: "no_tariff" });
  });
});
