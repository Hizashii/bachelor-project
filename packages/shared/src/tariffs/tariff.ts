// The shape of one carrier tariff version: zones, brackets, rates and surcharges.
// A published version is never edited; changes create a new version (see lifecycle.ts).
// Not for calculating prices: see calculate.ts.

import { z } from "zod";

export const pricingMethodSchema = z.enum([
  "per_shipment",
  "per_100kg",
  "per_pallet",
  "per_ldm",
  "per_cbm",
]);

export const tariffStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "active",
  "superseded",
  "archived",
]);

// Ids end up in storage paths, so only letters, digits and dashes are allowed.
export const safeIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

const MAX_ZONES = 500;
const MAX_RANGES_PER_ZONE = 500;
const MAX_BRACKETS = 200;
const MAX_RATES = 100_000;
const MIN_QUANTITY_STEP = 0.001;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// A postcode range is written with as many digits as the carrier uses: "26" to "29"
// covers 2600 to 2999, while "2650" to "2670" is exact.
export const tariffPostcodeRangeSchema = z
  .object({
    from: z.string().regex(/^\d{1,4}$/),
    to: z.string().regex(/^\d{1,4}$/),
  })
  .strict();

export const tariffZoneSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    ranges: z.array(tariffPostcodeRangeSchema).max(MAX_RANGES_PER_ZONE),
  })
  .strict();

// A bracket holds quantities from `from` up to and including `to` (null means no limit).
export const bracketSchema = z
  .object({
    from: z.number().nonnegative(),
    to: z.number().positive().nullable(),
  })
  .strict();

// A missing rate is null. A zero rate is only valid when the carrier typed 0.
export const rateSchema = z
  .object({
    zoneId: z.string().min(1),
    bracketIndex: z.number().int().nonnegative(),
    amountMinor: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const tariffSurchargeSchema = z
  .object({
    name: z.string().min(1),
    kind: z.enum(["fuel", "additional"]),
    calculation: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("percentage"),
          basisPoints: z.number().int().min(0).max(10_000),
        })
        .strict(),
      z
        .object({
          kind: z.literal("per_shipment"),
          amountMinor: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("per_unit"),
          amountMinor: z.number().int().nonnegative(),
        })
        .strict(),
    ]),
  })
  .strict();

export const tariffDiscountSchema = z
  .object({
    name: z.string().min(1),
    basisPoints: z.number().int().min(1).max(10_000),
  })
  .strict();

export const restrictionsSchema = z
  .object({
    maxWeightKg: z.number().positive().nullable(),
    maxPallets: z.number().positive().nullable(),
    maxLoadingMeters: z.number().positive().nullable(),
    maxCubicMeters: z.number().positive().nullable(),
    originRanges: z.array(tariffPostcodeRangeSchema),
  })
  .strict();

export const tariffSchema = z
  .object({
    tariffId: safeIdSchema,
    version: z.number().int().positive(),
    carrierOrganisationId: safeIdSchema,
    status: tariffStatusSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    method: pricingMethodSchema,
    postcodeLength: z.number().int().min(1).max(5),
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema.nullable(),
    zones: z.array(tariffZoneSchema).max(MAX_ZONES),
    brackets: z.array(bracketSchema).max(MAX_BRACKETS),
    rates: z.array(rateSchema).max(MAX_RATES),
    // Smallest step the chargeable quantity is rounded up to, for example 0.1 LDM.
    quantityStep: z.number().min(MIN_QUANTITY_STEP).nullable(),
    minimumChargeMinor: z.number().int().nonnegative().nullable(),
    // Price is rounded to a multiple of this many minor units (1 means no rounding).
    roundingStepMinor: z.number().int().positive(),
    discounts: z.array(tariffDiscountSchema),
    surcharges: z.array(tariffSurchargeSchema),
    restrictions: restrictionsSchema,
    sourceFile: z.string().nullable(),
    createdAt: z.string().datetime(),
    createdBy: z.string().min(1),
    submittedAt: z.string().datetime().nullable(),
    approvedAt: z.string().datetime().nullable(),
    approvedBy: z.string().nullable(),
  })
  .strict();

export type PricingMethod = z.infer<typeof pricingMethodSchema>;
export type TariffStatus = z.infer<typeof tariffStatusSchema>;
export type TariffPostcodeRange = z.infer<typeof tariffPostcodeRangeSchema>;
export type TariffZone = z.infer<typeof tariffZoneSchema>;
export type Bracket = z.infer<typeof bracketSchema>;
export type TariffSurcharge = z.infer<typeof tariffSurchargeSchema>;
export type Tariff = z.infer<typeof tariffSchema>;
