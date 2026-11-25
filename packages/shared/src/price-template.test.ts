// These tests lock down the carrier workbook's weighted price calculation.

import { describe, expect, it } from "vitest";
import {
  calculatePriceTemplate,
  type PriceTemplate,
  PriceTemplateCalculationError,
} from "./price-template.ts";

const template: PriceTemplate = {
  vendorName: "Test Carrier",
  currency: "DKK",
  countries: [
    {
      countryCode: "DE",
      bands: [
        {
          label: "0-1 kg",
          fromKg: 0,
          toKg: 1,
          economyMinor: 1_000,
          expressMinor: 2_000,
        },
        {
          label: "1-5 kg",
          fromKg: 1,
          toKg: 5,
          economyMinor: 3_000,
          expressMinor: 5_000,
        },
      ],
      additionalFees: [],
    },
  ],
};

describe("express price template calculation", () => {
  it("uses the workbook's weighted Economy and Express formula", () => {
    const result = calculatePriceTemplate(template, [
      {
        countryCode: "DE",
        weightKg: 2,
        numberOfShipments: 3,
        economyShareBasisPoints: 4_000,
      },
    ]);

    expect(result.totalMinor).toBe(12_600);
    expect(result.lines[0]).toMatchObject({ bandLabel: "1-5 kg" });
  });

  it("keeps one kilogram in the first band and moves above it to the next", () => {
    const result = calculatePriceTemplate(template, [
      {
        countryCode: "DE",
        weightKg: 1,
        numberOfShipments: 1,
        economyShareBasisPoints: 10_000,
      },
      {
        countryCode: "DE",
        weightKg: 1.01,
        numberOfShipments: 1,
        economyShareBasisPoints: 10_000,
      },
    ]);

    expect(result.lines.map((line) => line.bandLabel)).toEqual([
      "0-1 kg",
      "1-5 kg",
    ]);
    expect(result.totalMinor).toBe(4_000);
  });

  it("rejects a shipment for an unpriced country", () => {
    expect(() =>
      calculatePriceTemplate(template, [
        {
          countryCode: "FR",
          weightKg: 1,
          numberOfShipments: 1,
          economyShareBasisPoints: 0,
        },
      ]),
    ).toThrow(PriceTemplateCalculationError);
  });
});
