// Tests the offer rules that protect money and zones: overlap, gaps, ambiguity, units, currency, zero.

import { describe, expect, it } from "vitest";
import type { CarrierZone, StoredBid } from "../contracts/offer.ts";
import { validateOffer } from "./validate.ts";

const ID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ZONE_A = ID(1);
const ZONE_B = ID(2);

function zone(id: string, code: string, from: string, to: string): CarrierZone {
  return {
    id,
    code,
    name: `Zone ${code}`,
    originCountry: "DK",
    destinationCountry: "DK",
    originRanges: [],
    destinationRanges: [{ fromPrefix: from, toPrefix: to, priority: 0 }],
    destinationPostcodes: [],
  };
}

function band(n: number, zoneId: string, from: number, to: number | null) {
  return {
    id: ID(100 + n),
    zoneId,
    unit: "kg" as const,
    basis: "per_shipment" as const,
    fromQuantity: from,
    toQuantity: to,
    price: { amountMinor: 50_000, currency: "DKK" },
    deliveryTime: { minimumBusinessDays: 1, maximumBusinessDays: 2 },
    dataVersion: 1,
  };
}

function offer(overrides: Partial<StoredBid> = {}): StoredBid {
  return {
    id: ID(900),
    tenderId: ID(901),
    carrierCompanyId: ID(902),
    createdByUserId: ID(903),
    versionNumber: 1,
    state: "draft",
    rates: [
      band(1, ZONE_A, 0, 50),
      band(2, ZONE_A, 51, null),
      band(3, ZONE_B, 0, null),
    ],
    surcharges: [],
    serviceCoverage: { countryCodes: [], zoneIds: [], notes: "" },
    createdAtUtc: "2027-01-01T00:00:00Z",
    submittedAtUtc: null,
    supersedesVersionId: null,
    withdrawnAtUtc: null,
    sourceTemplate: null,
    zones: [zone(ZONE_A, "1", "00", "49"), zone(ZONE_B, "2", "50", "99")],
    notes: {
      serviceDescription: "",
      supportedUnits: ["kg"],
      minimumChargeMinor: null,
    },
    ...overrides,
  };
}

const codes = (bid: StoredBid, currency = "DKK") =>
  validateOffer(bid, currency).issues.map((i) => i.code);

describe("validateOffer", () => {
  it("accepts a clean offer", () => {
    expect(validateOffer(offer(), "DKK")).toEqual({
      complete: true,
      issues: [],
    });
  });

  it("flags zones that share postcodes, by range and by explicit code", () => {
    const ranges = offer({
      zones: [zone(ZONE_A, "1", "00", "55"), zone(ZONE_B, "2", "50", "99")],
    });
    expect(codes(ranges)).toContain("zone_overlap");
    const listed = zone(ZONE_B, "2", "90", "99");
    listed.destinationPostcodes = ["2300"];
    const explicit = offer({ zones: [zone(ZONE_A, "1", "20", "29"), listed] });
    expect(codes(explicit)).toContain("zone_overlap");
  });

  it("flags two bands that match the same quantity", () => {
    const rates = [
      band(1, ZONE_A, 0, 60),
      band(2, ZONE_A, 50, null),
      band(3, ZONE_B, 0, null),
    ];
    expect(codes(offer({ rates }))).toContain("ambiguous_pricing");
  });

  it("flags a gap between bands but not neighbouring whole kilos", () => {
    const rates = [
      band(1, ZONE_A, 0, 50),
      band(2, ZONE_A, 80, null),
      band(3, ZONE_B, 0, null),
    ];
    expect(codes(offer({ rates }))).toContain("rate_gap");
    expect(codes(offer())).not.toContain("rate_gap");
  });

  it("rejects a unit the carrier does not price in", () => {
    const notes = {
      serviceDescription: "",
      supportedUnits: ["pallets" as const],
      minimumChargeMinor: null,
    };
    expect(codes(offer({ notes }))).toContain("unit_not_supported");
  });

  it("rejects a price in another currency than the tender", () => {
    expect(codes(offer(), "EUR")).toContain("currency_mismatch");
  });

  it("allows an explicit zero price but warns, and blocks a missing price", () => {
    const zero = band(3, ZONE_B, 0, null);
    zero.price.amountMinor = 0;
    const result = validateOffer(
      offer({
        rates: [band(1, ZONE_A, 0, 50), band(2, ZONE_A, 51, null), zero],
      }),
      "DKK",
    );
    expect(result.complete).toBe(true);
    expect(result.issues.map((i) => i.code)).toEqual(["zero_price"]);
    const missing = band(3, ZONE_B, 0, null);
    missing.price.amountMinor = Number.NaN;
    expect(codes(offer({ rates: [missing] }))).toContain("invalid_amount");
  });

  it("flags a rate for an unknown zone and a zone with no prices", () => {
    const rates = [band(1, ZONE_A, 0, null), band(2, ID(77), 0, null)];
    const found = codes(offer({ rates }));
    expect(found).toContain("unknown_zone");
    expect(found).toContain("zone_without_rates");
  });

  it("flags bad delivery times and bad surcharges", () => {
    const slow = band(3, ZONE_B, 0, null);
    slow.deliveryTime = { minimumBusinessDays: 5, maximumBusinessDays: 2 };
    const surcharges = [
      {
        id: ID(50),
        name: "Fuel",
        kind: "fuel" as const,
        calculation: { kind: "percentage" as const, basisPoints: 20_000 },
        appliesTo: "shipment" as const,
        vatTreatment: "excluded" as const,
      },
    ];
    const found = codes(
      offer({ rates: [band(1, ZONE_A, 0, null), slow], surcharges }),
    );
    expect(found).toContain("bad_delivery_time");
    expect(found).toContain("surcharge_invalid");
  });
});
