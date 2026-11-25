// These tests lock down the carrier workbook's weighted price calculation.

import { describe, expect, it } from "vitest";
import {
  calculateBandVolumes,
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

describe("calculateBandVolumes", () => {
  const template = {
    vendorName: "Carrier",
    currency: "DKK",
    countries: [
      {
        countryCode: "DE",
        bands: [
          {
            label: "0-1 kg",
            fromKg: 0,
            toKg: 1,
            economyMinor: 4_000,
            expressMinor: 6_000,
            pickupMinor: 500,
          },
          {
            label: "1-5 kg",
            fromKg: 1,
            toKg: 5,
            economyMinor: 5_000,
            expressMinor: 8_000,
          },
        ],
        additionalFees: [],
      },
    ],
  };

  it("prices each country and band like the workbook formula", () => {
    const result = calculateBandVolumes(template, [
      {
        countryCode: "DE",
        bandLabel: "0-1 kg",
        numberOfShipments: 100,
        economyShareBasisPoints: 5_000,
      },
      {
        countryCode: "DE",
        bandLabel: "1-5 kg",
        numberOfShipments: 10,
        economyShareBasisPoints: 10_000,
      },
      {
        countryCode: "DE",
        bandLabel: "1-5 kg",
        numberOfShipments: 0,
        economyShareBasisPoints: 0,
      },
    ]);

    expect(result.lines).toHaveLength(2);
    expect(result.totalMinor).toBe(100 * 5_000 + 10 * 5_000);
  });

  it("refuses a country or band the carrier did not price", () => {
    expect(() =>
      calculateBandVolumes(template, [
        {
          countryCode: "SE",
          bandLabel: "0-1 kg",
          numberOfShipments: 1,
          economyShareBasisPoints: 0,
        },
      ]),
    ).toThrow(/SE is not priced/);
    expect(() =>
      calculateBandVolumes(template, [
        {
          countryCode: "DE",
          bandLabel: "5-10 kg",
          numberOfShipments: 1,
          economyShareBasisPoints: 0,
        },
      ]),
    ).toThrow(/no price for 5-10 kg/);
  });
});
