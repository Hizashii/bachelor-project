// Tests for pricing methods, zones, tariff validation and versions. All carriers and
// rates are synthetic.

import { describe, expect, it } from "vitest";
import { calculatePrice, type PriceShipment } from "./calculate.ts";
import {
  activate,
  canTransition,
  selectVersion,
  startNextVersion,
  TariffTransitionError,
  transition,
} from "./lifecycle.ts";
import type { PricingMethod, Tariff } from "./tariff.ts";
import { validateTariff } from "./validate.ts";
import { findCoverageGaps, findZone, validateZones } from "./zones.ts";

const NOW = "2026-03-01T10:00:00Z";

function makeTariff(
  method: PricingMethod,
  overrides: Partial<Tariff> = {},
): Tariff {
  return {
    tariffId: "t-1",
    version: 1,
    carrierOrganisationId: "carrier-a",
    status: "active",
    currency: "DKK",
    method,
    postcodeLength: 4,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    zones: [
      { id: "z1", name: "Zone A", ranges: [{ from: "00", to: "26" }] },
      { id: "z2", name: "Zone B", ranges: [{ from: "30", to: "36" }] },
    ],
    brackets: [
      { from: 0, to: 100 },
      { from: 100, to: null },
    ],
    rates: [
      { zoneId: "z1", bracketIndex: 0, amountMinor: 20_000 },
      { zoneId: "z1", bracketIndex: 1, amountMinor: 15_000 },
      { zoneId: "z2", bracketIndex: 0, amountMinor: 30_000 },
      { zoneId: "z2", bracketIndex: 1, amountMinor: 25_000 },
    ],
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
    createdAt: NOW,
    createdBy: "u1",
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
    ...overrides,
  };
}

const shipment: PriceShipment = {
  originPostcode: "8300",
  destinationPostcode: "3100",
  date: "2026-03-05",
  weightKg: 250,
  pallets: 4,
  loadingMeters: 2.4,
  cubicMeters: 6,
};

function total(tariff: Tariff, overrides: Partial<PriceShipment> = {}) {
  const result = calculatePrice(tariff, { ...shipment, ...overrides });
  return result.status === "priced" ? result.totalMinor : result.reason;
}

describe("pricing methods", () => {
  it("fixed price per shipment uses the weight bracket", () => {
    expect(total(makeTariff("per_shipment"))).toBe(25_000);
  });

  it("price per 100 kg multiplies the bracket rate by weight / 100", () => {
    expect(total(makeTariff("per_100kg"))).toBe(62_500);
  });

  it("price per pallet, per LDM and per m3 multiply by the quantity", () => {
    const pallets = makeTariff("per_pallet", {
      brackets: [{ from: 0, to: null }],
    });
    expect(
      total({
        ...pallets,
        rates: [{ zoneId: "z2", bracketIndex: 0, amountMinor: 30_000 }],
      }),
    ).toBe(120_000);
    const ldm = makeTariff("per_ldm", {
      brackets: [{ from: 0, to: null }],
      rates: [{ zoneId: "z2", bracketIndex: 0, amountMinor: 30_000 }],
    });
    expect(total(ldm)).toBe(72_000);
    const cbm = makeTariff("per_cbm", {
      brackets: [{ from: 0, to: null }],
      rates: [{ zoneId: "z2", bracketIndex: 0, amountMinor: 1_050 }],
    });
    expect(total(cbm)).toBe(6_300);
  });

  it("applies bracket boundaries as above the lower and up to the upper limit", () => {
    const tariff = makeTariff("per_shipment");
    expect(total(tariff, { weightKg: 100 })).toBe(30_000);
    expect(total(tariff, { weightKg: 100.001 })).toBe(25_000);
  });
});

describe("charges around the base price", () => {
  it("rounds the quantity up, raises to the minimum and adds surcharges and discounts", () => {
    const tariff = makeTariff("per_ldm", {
      brackets: [{ from: 0, to: null }],
      rates: [{ zoneId: "z2", bracketIndex: 0, amountMinor: 10_000 }],
      quantityStep: 0.5,
      minimumChargeMinor: 20_000,
      discounts: [{ name: "Volume discount", basisPoints: 500 }],
      surcharges: [
        {
          name: "Fuel",
          kind: "fuel",
          calculation: { kind: "percentage", basisPoints: 1_250 },
        },
        {
          name: "Tail lift",
          kind: "additional",
          calculation: { kind: "per_shipment", amountMinor: 7_500 },
        },
      ],
    });
    const result = calculatePrice(tariff, { ...shipment, loadingMeters: 2.1 });
    expect(result).toMatchObject({ status: "priced", chargeableQuantity: 2.5 });
    // 2.5 LDM x 100.00 = 250.00; minus 5% = 237.50; fuel 12.5% = 29.69; plus 75.00
    expect(result.status === "priced" && result.totalMinor).toBe(
      23_750 + 2_969 + 7_500,
    );
  });

  it("never sums money with floating point drift", () => {
    const tariff = makeTariff("per_100kg", {
      brackets: [{ from: 0, to: null }],
      rates: [{ zoneId: "z2", bracketIndex: 0, amountMinor: 1 }],
    });
    expect(total(tariff, { weightKg: 33.333 })).toBe(0);
    expect(total(tariff, { weightKg: 50 })).toBe(1);
  });
});

describe("price failures", () => {
  const tariff = makeTariff("per_100kg");

  it("reports the reason instead of inventing a price", () => {
    expect(total(tariff, { date: "2025-12-31" })).toBe("outside_dates");
    expect(total(tariff, { destinationPostcode: "2700" })).toBe("no_zone");
    expect(total(tariff, { weightKg: null })).toBe("missing_quantity");
    expect(total(makeTariff("per_100kg", { rates: [] }))).toBe("missing_rate");
    expect(
      total(
        makeTariff("per_100kg", {
          restrictions: { ...tariff.restrictions, maxWeightKg: 200 },
        }),
      ),
    ).toBe("restriction_exceeded");
  });
});

describe("zones", () => {
  it("includes both boundary prefixes", () => {
    const { zones } = makeTariff("per_100kg");
    expect(findZone("2699", zones, 4)?.id).toBe("z1");
    expect(findZone("2700", zones, 4)).toBeNull();
    expect(findZone("3699", zones, 4)?.id).toBe("z2");
  });

  it("detects overlaps and duplicate ranges across precisions", () => {
    const zones = [
      { id: "a", name: "A", ranges: [{ from: "26", to: "29" }] },
      { id: "b", name: "B", ranges: [{ from: "2800", to: "2850" }] },
      { id: "c", name: "C", ranges: [{ from: "26", to: "29" }] },
    ];
    const codes = validateZones(zones, 4).map((p) => p.code);
    expect(codes).toContain("overlap");
    expect(codes).toContain("duplicate_range");
  });

  it("lists postcodes no zone covers", () => {
    expect(findCoverageGaps(makeTariff("per_100kg").zones, 4)).toEqual([
      { low: 2700, high: 2999 },
      { low: 3700, high: 9999 },
    ]);
  });
});

describe("tariff validation", () => {
  it("accepts a complete tariff with a gap warning", () => {
    const result = validateTariff(makeTariff("per_100kg"));
    expect(result.complete).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("postcode_gaps");
  });

  it("blocks missing rates and bracket gaps", () => {
    const base = makeTariff("per_100kg");
    const result = validateTariff({
      ...base,
      brackets: [
        { from: 0, to: 100 },
        { from: 150, to: null },
      ],
      rates: base.rates.slice(1),
    });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("missing_rate");
    expect(codes).toContain("bracket_gap_or_overlap");
  });
});

describe("versions and permissions", () => {
  const draft = makeTariff("per_100kg", { status: "draft" });

  it("lets a carrier submit but not approve", () => {
    expect(canTransition("draft", "submitted", "carrier")).toBe(true);
    expect(canTransition("submitted", "approved", "carrier")).toBe(false);
    expect(() =>
      transition(
        { ...draft, status: "submitted" },
        "approved",
        "carrier",
        "u1",
        NOW,
      ),
    ).toThrow(TariffTransitionError);
  });

  it("makes a new draft version and leaves the published one unchanged", () => {
    const published = makeTariff("per_100kg", { status: "active" });
    const next = startNextVersion(published, 1, "u2", NOW);
    expect(next).toMatchObject({ version: 2, status: "draft" });
    expect(published).toMatchObject({ version: 1, status: "active" });
  });

  it("supersedes the active version on activation and keeps it for old dates", () => {
    const v1 = makeTariff("per_100kg", {
      status: "active",
      effectiveTo: "2026-06-30",
    });
    const v2 = makeTariff("per_100kg", {
      version: 2,
      status: "approved",
      effectiveFrom: "2026-07-01",
    });
    const [activated, superseded] = activate(
      v2,
      [v1, v2],
      "consultant",
      "u3",
      NOW,
    );
    expect(activated?.status).toBe("active");
    expect(superseded?.status).toBe("superseded");
    const all = [activated, superseded].filter(
      (t): t is Tariff => t !== undefined,
    );
    expect(selectVersion(all, "2026-03-05")?.version).toBe(1);
    expect(selectVersion(all, "2026-08-01")?.version).toBe(2);
  });

  it("does not price a shipment above the only closed bracket or with absurd quantities", () => {
    const closed = makeTariff("per_shipment", {
      brackets: [{ from: 0, to: 500 }],
    });
    expect(total(closed, { weightKg: 1000 })).toBe("no_bracket");
    expect(total(makeTariff("per_100kg"), { weightKg: 1e308 })).toBe(
      "restriction_exceeded",
    );
  });

  it("flags backwards brackets and duplicate rates", () => {
    const base = makeTariff("per_100kg");
    const result = validateTariff({
      ...base,
      brackets: [
        { from: 0, to: 0 },
        { from: 0, to: null },
      ],
      rates: [...base.rates, base.rates[0] as (typeof base.rates)[number]],
    });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("bracket_not_increasing");
    expect(codes).toContain("duplicate_rate");
  });
});
