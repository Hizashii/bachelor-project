// This file defines the output of the pricing engine and the comparison screen.
// Money is integer minor units. A missing price is "ineligible", never zero.

import { z } from "zod";
import {
  basisPointsSchema,
  currencyCodeSchema,
  entityIdSchema,
  nonNegativeIntegerSchema,
  utcDateTimeSchema,
} from "../schemas/business-primitives.ts";

export const ineligibleReasonSchema = z.enum([
  "no_zone_match",
  "no_rate_band",
  "unit_unsupported",
  "currency_mismatch",
  "not_covered",
  "missing_rate",
  "invalid_offer",
]);

export const shipmentPriceSchema = z
  .object({
    shipmentId: entityIdSchema,
    status: z.enum(["priced", "ineligible"]),
    baseMinor: nonNegativeIntegerSchema.nullable(),
    fuelMinor: nonNegativeIntegerSchema.nullable(),
    feesMinor: nonNegativeIntegerSchema.nullable(),
    totalMinor: nonNegativeIntegerSchema.nullable(),
    zoneCode: z.string().nullable(),
    reason: ineligibleReasonSchema.nullable(),
  })
  .strict();

export const zoneTotalSchema = z
  .object({
    zoneCode: z.string(),
    shipments: nonNegativeIntegerSchema,
    totalMinor: nonNegativeIntegerSchema,
  })
  .strict();

export const carrierResultSchema = z
  .object({
    carrierCompanyId: entityIdSchema,
    bidVersionId: entityIdSchema,
    versionNumber: z.number().int().positive(),
    currency: currencyCodeSchema,
    // Eligible for ranking: valid offer and every matched shipment priced.
    rankable: z.boolean(),
    pricedShipments: nonNegativeIntegerSchema,
    ineligibleShipments: nonNegativeIntegerSchema,
    coverageBasisPoints: basisPointsSchema,
    totalMinor: nonNegativeIntegerSchema,
    byZone: z.array(zoneTotalSchema),
    shipments: z.array(shipmentPriceSchema),
    maxTransitDays: nonNegativeIntegerSchema.nullable(),
    invalidReasons: z.array(z.string()),
    weightedScoreBasisPoints: basisPointsSchema.nullable(),
  })
  .strict();

export const comparisonResultSchema = z
  .object({
    tenderId: entityIdSchema,
    generatedAtUtc: utcDateTimeSchema,
    currency: currencyCodeSchema,
    carriers: z.array(carrierResultSchema),
    // Shipments no tender zone matched. They are shown and never priced as zero.
    unmatchedShipmentIds: z.array(entityIdSchema),
    cheapestRankableBidVersionId: entityIdSchema.nullable(),
  })
  .strict();

export type IneligibleReason = z.infer<typeof ineligibleReasonSchema>;
export type ShipmentPrice = z.infer<typeof shipmentPriceSchema>;
export type CarrierResult = z.infer<typeof carrierResultSchema>;
export type ComparisonResult = z.infer<typeof comparisonResultSchema>;
