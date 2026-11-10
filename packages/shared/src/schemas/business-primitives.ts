// This file defines the small validated values shared by Freight Desk models.

import { z } from "zod";

export const entityIdSchema = z.string().uuid();
export const utcDateTimeSchema = z.string().datetime({ offset: true });
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const positiveIntegerSchema = z.number().int().positive();
export const basisPointsSchema = z.number().int().min(0).max(10_000);

export const userRoleSchema = z.enum(["carrier", "consultant", "master"]);
export const tenderStatusSchema = z.enum([
  "draft",
  "open",
  "closed",
  "awarded",
  "archived",
]);
export const offerStateSchema = z.enum([
  "draft",
  "submitted",
  "superseded",
  "withdrawn",
]);
export const transportUnitSchema = z.enum([
  "kg",
  "pallets",
  "CBM",
  "LDM",
  "packages",
]);
export const rateBasisSchema = z.enum([
  "per_shipment",
  "per_kg",
  "per_100kg",
  "per_pallet",
  "per_cbm",
  "per_ldm",
  "per_package",
]);
export const vatTreatmentSchema = z.enum([
  "included",
  "excluded",
  "zero_rated",
  "reverse_charge",
  "not_applicable",
]);
export const templateKindSchema = z.enum(["shipment", "carrier_rate", "award"]);

export const moneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: currencyCodeSchema,
  })
  .strict();

export const deliveryTimeSchema = z
  .object({
    minimumBusinessDays: nonNegativeIntegerSchema,
    maximumBusinessDays: nonNegativeIntegerSchema,
  })
  .strict()
  .refine(
    (value) => value.minimumBusinessDays <= value.maximumBusinessDays,
    "Minimum delivery time cannot exceed maximum delivery time",
  );

export const quantitySchema = z
  .object({
    unit: transportUnitSchema,
    value: z.number().positive(),
  })
  .strict();

export const postcodeRangeSchema = z
  .object({
    fromPrefix: z.string().regex(/^\d{2}$/),
    toPrefix: z.string().regex(/^\d{2}$/),
    priority: nonNegativeIntegerSchema,
  })
  .strict()
  .refine(
    (value) => Number(value.fromPrefix) <= Number(value.toPrefix),
    "Postcode range must have an ordered boundary",
  );

export const zonePolicySchema = z
  .object({
    overlapMode: z.enum(["reject", "priority"]),
    unmatchedPostcodesBlockAward: z.boolean(),
  })
  .strict();

export const serviceCoverageSchema = z
  .object({
    countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)),
    zoneIds: z.array(entityIdSchema),
    notes: z.string(),
  })
  .strict();

export const surchargeSchema = z
  .object({
    id: entityIdSchema,
    name: z.string().min(1),
    kind: z.enum(["fuel", "additional"]),
    calculation: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("percentage"),
          basisPoints: basisPointsSchema,
        })
        .strict(),
      z.object({ kind: z.literal("fixed"), amount: moneySchema }).strict(),
    ]),
    appliesTo: z.enum(["shipment", "quantity", "rate_band"]),
    vatTreatment: vatTreatmentSchema,
  })
  .strict();

export const rateBandSchema = z
  .object({
    id: entityIdSchema,
    zoneId: entityIdSchema,
    unit: transportUnitSchema,
    basis: rateBasisSchema,
    fromQuantity: z.number().nonnegative(),
    toQuantity: z.number().nonnegative().nullable(),
    price: moneySchema,
    deliveryTime: deliveryTimeSchema,
    dataVersion: positiveIntegerSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.toQuantity === null || value.fromQuantity <= value.toQuantity,
    "Rate band must have an ordered boundary",
  );

export const evaluationSchema = z
  .object({
    mode: z.enum(["cheapest_eligible", "weighted"]),
    criteria: z
      .array(
        z
          .object({
            kind: z.enum([
              "price",
              "service_quality",
              "transit_time",
              "coverage",
            ]),
            weightBasisPoints: basisPointsSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (value) =>
      value.mode === "cheapest_eligible" ||
      value.criteria.reduce(
        (total, criterion) => total + criterion.weightBasisPoints,
        0,
      ) === 10_000,
    "Weighted evaluation criteria must total 10,000 basis points",
  );

export const excelTemplateSchema = z
  .object({
    id: entityIdSchema,
    kind: templateKindSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    fileName: z.string().min(1),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["active", "retired"]),
    approvedAtUtc: utcDateTimeSchema,
  })
  .strict();
