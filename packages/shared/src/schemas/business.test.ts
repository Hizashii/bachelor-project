// This file checks the business model boundaries without testing Zod itself.

import { describe, expect, it } from "vitest";
import {
  evaluationSchema,
  offerStateSchema,
  postcodeRangeSchema,
  rateBandSchema,
  tenderStatusSchema,
  userMembershipSchema,
} from "./business.ts";

const companyId = "2f7d5f0e-1b0f-4c6f-8d2c-4a1b1f2d3e40";

describe("business schemas", () => {
  it("keeps submitted as an offer state, not a tender state", () => {
    expect(tenderStatusSchema.safeParse("submitted").success).toBe(false);
    expect(offerStateSchema.safeParse("submitted").success).toBe(true);
  });

  it("rejects reversed postcode ranges", () => {
    expect(
      postcodeRangeSchema.safeParse({
        fromPrefix: "30",
        toPrefix: "29",
        priority: 0,
      }).success,
    ).toBe(false);
  });

  it("requires a carrier membership to name its company", () => {
    expect(
      userMembershipSchema.safeParse({
        id: "d6fb0c5e-9b04-4a9b-aed2-f9d7a4d8c2a1",
        entraUserId: "fictional-carrier-user",
        role: "carrier",
        carrierCompanyId: null,
        status: "active",
        createdAtUtc: "2026-11-10T12:00:00Z",
        updatedAtUtc: "2026-11-10T12:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit zero rate but rejects an invalid band", () => {
    const result = rateBandSchema.safeParse({
      id: "e6fb0c5e-9b04-4a9b-aed2-f9d7a4d8c2a1",
      zoneId: companyId,
      unit: "kg",
      basis: "per_kg",
      fromQuantity: 0,
      toQuantity: 100,
      price: { amountMinor: 0, currency: "DKK" },
      deliveryTime: { minimumBusinessDays: 1, maximumBusinessDays: 2 },
      dataVersion: 1,
    });

    expect(result.success).toBe(true);
    expect(
      rateBandSchema.safeParse({
        id: "e6fb0c5e-9b04-4a9b-aed2-f9d7a4d8c2a1",
        zoneId: companyId,
        unit: "kg",
        basis: "per_kg",
        fromQuantity: 101,
        toQuantity: 100,
        price: { amountMinor: 100, currency: "DKK" },
        deliveryTime: { minimumBusinessDays: 1, maximumBusinessDays: 2 },
        dataVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("requires weighted criteria to total 10,000 basis points", () => {
    expect(
      evaluationSchema.safeParse({
        mode: "weighted",
        criteria: [{ kind: "price", weightBasisPoints: 9_999 }],
      }).success,
    ).toBe(false);
  });
});
