// Shared model and calculation for the carrier express price template.
// This file does not read Excel files; the API maps workbook cells into this model.

import { z } from "zod";

const COUNTRY_CODE = /^[A-Z]{2}$/;
const MAX_BASIS_POINTS = 10_000;

export const priceTemplateBandSchema = z
  .object({
    label: z.string().min(1),
    fromKg: z.number().nonnegative(),
    toKg: z.number().positive().nullable(),
    economyMinor: z.number().int().nonnegative(),
    expressMinor: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (band) => band.toKg === null || band.fromKg < band.toKg,
    "A price band must have an ordered boundary",
  );

export const priceTemplateCountrySchema = z
  .object({
    countryCode: z.string().regex(COUNTRY_CODE),
    bands: z.array(priceTemplateBandSchema).min(1),
    additionalFees: z.array(
      z
        .object({
          name: z.string().min(1),
          amountMinor: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export const priceTemplateSchema = z
  .object({
    vendorName: z.string().trim().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/),
    countries: z.array(priceTemplateCountrySchema).min(1),
  })
  .strict();

export type PriceTemplate = z.infer<typeof priceTemplateSchema>;
export type PriceTemplateBand = z.infer<typeof priceTemplateBandSchema>;

export type PriceTemplateShipment = {
  countryCode: string;
  weightKg: number;
  numberOfShipments: number;
  economyShareBasisPoints: number;
};

export type PriceTemplateLine = {
  countryCode: string;
  bandLabel: string;
  numberOfShipments: number;
  economyShareBasisPoints: number;
  totalMinor: number;
};

export type PriceTemplateCalculation = {
  currency: string;
  totalMinor: number;
  lines: PriceTemplateLine[];
};

export class PriceTemplateCalculationError extends Error {}

export function calculatePriceTemplate(
  template: PriceTemplate,
  shipments: readonly PriceTemplateShipment[],
): PriceTemplateCalculation {
  const lines = shipments.map((shipment) => calculateLine(template, shipment));
  return {
    currency: template.currency,
    totalMinor: lines.reduce((total, line) => total + line.totalMinor, 0),
    lines,
  };
}

function calculateLine(
  template: PriceTemplate,
  shipment: PriceTemplateShipment,
): PriceTemplateLine {
  validateShipment(shipment);
  const country = template.countries.find(
    (item) => item.countryCode === shipment.countryCode,
  );
  if (!country)
    throw new PriceTemplateCalculationError("Country is not priced.");
  const band = country.bands.find((item) => fitsBand(item, shipment.weightKg));
  if (!band)
    throw new PriceTemplateCalculationError(
      "Weight is outside the price bands.",
    );
  const weightedMinor =
    BigInt(band.economyMinor) * BigInt(shipment.economyShareBasisPoints) +
    BigInt(band.expressMinor) *
      BigInt(MAX_BASIS_POINTS - shipment.economyShareBasisPoints);
  const perShipmentMinor = divideRound(weightedMinor, BigInt(MAX_BASIS_POINTS));
  return {
    countryCode: shipment.countryCode,
    bandLabel: band.label,
    numberOfShipments: shipment.numberOfShipments,
    economyShareBasisPoints: shipment.economyShareBasisPoints,
    totalMinor: Number(perShipmentMinor * BigInt(shipment.numberOfShipments)),
  };
}

function validateShipment(shipment: PriceTemplateShipment): void {
  if (!COUNTRY_CODE.test(shipment.countryCode)) {
    throw new PriceTemplateCalculationError("Country code is invalid.");
  }
  if (!Number.isFinite(shipment.weightKg) || shipment.weightKg <= 0) {
    throw new PriceTemplateCalculationError("Weight must be positive.");
  }
  if (
    !Number.isInteger(shipment.numberOfShipments) ||
    shipment.numberOfShipments < 1
  ) {
    throw new PriceTemplateCalculationError(
      "Shipment count must be a positive integer.",
    );
  }
  if (
    !Number.isInteger(shipment.economyShareBasisPoints) ||
    shipment.economyShareBasisPoints < 0 ||
    shipment.economyShareBasisPoints > MAX_BASIS_POINTS
  ) {
    throw new PriceTemplateCalculationError(
      "Economy share must be between 0% and 100%.",
    );
  }
}

function fitsBand(band: PriceTemplateBand, weightKg: number): boolean {
  return (
    weightKg > band.fromKg && (band.toKg === null || weightKg <= band.toKg)
  );
}

function divideRound(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}
