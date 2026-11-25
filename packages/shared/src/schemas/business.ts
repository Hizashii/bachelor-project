// This file defines validated Freight Desk resource models, not API handlers.

import { z } from "zod";
import { priceTemplateSchema } from "../price-template.ts";
import {
  basisPointsSchema,
  currencyCodeSchema,
  entityIdSchema,
  evaluationSchema,
  excelTemplateSchema,
  offerStateSchema,
  positiveIntegerSchema,
  postcodeRangeSchema,
  quantitySchema,
  rateBandSchema,
  serviceCoverageSchema,
  surchargeSchema,
  tenderStatusSchema,
  timeZoneSchema,
  userRoleSchema,
  utcDateTimeSchema,
  vatTreatmentSchema,
  zonePolicySchema,
} from "./business-primitives.ts";

export * from "./business-primitives.ts";

export const postcodeZoneSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    code: z.string().min(1),
    name: z.string().min(1),
    ranges: z.array(postcodeRangeSchema).min(1),
    dataVersion: positiveIntegerSchema,
  })
  .strict();

export const carrierCompanySchema = z
  .object({
    id: entityIdSchema,
    legalName: z.string().min(1),
    displayName: z.string().min(1),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    externalReference: z.string(),
    status: z.enum(["active", "suspended", "archived"]),
    createdAtUtc: utcDateTimeSchema,
    updatedAtUtc: utcDateTimeSchema,
  })
  .strict();

export const userMembershipSchema = z
  .object({
    id: entityIdSchema,
    entraUserId: z.string().min(1),
    role: userRoleSchema,
    carrierCompanyId: entityIdSchema.nullable(),
    status: z.enum(["active", "suspended"]),
    createdAtUtc: utcDateTimeSchema,
    updatedAtUtc: utcDateTimeSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.role === "carrier"
        ? value.carrierCompanyId !== null
        : value.carrierCompanyId === null,
    "Only carrier memberships have a carrier company",
  );

export const invitationSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    carrierCompanyId: entityIdSchema,
    invitedByUserId: entityIdSchema,
    state: z.enum(["invited", "accepted", "declined", "expired", "revoked"]),
    invitedAtUtc: utcDateTimeSchema,
    respondedAtUtc: utcDateTimeSchema.nullable(),
  })
  .strict();

export const shipmentSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    sequence: positiveIntegerSchema,
    originPostcode: z.string().min(1),
    destinationPostcode: z.string().min(1),
    originCountry: z.string().regex(/^[A-Z]{2}$/),
    destinationCountry: z.string().regex(/^[A-Z]{2}$/),
    quantities: z.array(quantitySchema).min(1),
    originZoneId: entityIdSchema.nullable(),
    destinationZoneId: entityIdSchema.nullable(),
    sourceRowNumber: positiveIntegerSchema,
    dataVersion: positiveIntegerSchema,
  })
  .strict();

export const tenderSchema = z
  .object({
    id: entityIdSchema,
    revision: positiveIntegerSchema,
    name: z.string().min(1),
    customerReference: z.string().min(1),
    status: tenderStatusSchema,
    ownerUserId: entityIdSchema,
    deadlineUtc: utcDateTimeSchema.nullable(),
    displayTimeZone: timeZoneSchema,
    currency: currencyCodeSchema,
    vatTreatment: vatTreatmentSchema.nullable(),
    vatRateBasisPoints: basisPointsSchema.nullable(),
    zonePolicy: zonePolicySchema.nullable(),
    evaluation: evaluationSchema.nullable(),
    shipmentTemplate: excelTemplateSchema.nullable(),
    carrierRateTemplate: excelTemplateSchema.nullable(),
    shipmentBasis: z.string().min(1).nullable(),
    invitedCarrierCompanyIds: z.array(entityIdSchema),
    createdAtUtc: utcDateTimeSchema,
    updatedAtUtc: utcDateTimeSchema,
    openedAtUtc: utcDateTimeSchema.nullable(),
    closedAtUtc: utcDateTimeSchema.nullable(),
    awardedAtUtc: utcDateTimeSchema.nullable(),
    awardedCarrierCompanyId: entityIdSchema.nullable().default(null),
    awardReason: z.string().max(500).nullable().default(null),
    archivedAtUtc: utcDateTimeSchema.nullable(),
  })
  .strict();

export const tenderDraftInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    customerReference: z.string().trim().min(1).max(200),
    displayTimeZone: timeZoneSchema,
    currency: currencyCodeSchema,
    deadlineUtc: utcDateTimeSchema.nullable().optional(),
    vatTreatment: vatTreatmentSchema.nullable().optional(),
    vatRateBasisPoints: basisPointsSchema.nullable().optional(),
    zonePolicy: zonePolicySchema.nullable().optional(),
    evaluation: evaluationSchema.nullable().optional(),
    shipmentTemplate: excelTemplateSchema.nullable().optional(),
    carrierRateTemplate: excelTemplateSchema.nullable().optional(),
    shipmentBasis: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const bidVersionSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    carrierCompanyId: entityIdSchema,
    createdByUserId: entityIdSchema,
    versionNumber: positiveIntegerSchema,
    state: offerStateSchema,
    rates: z.array(rateBandSchema),
    surcharges: z.array(surchargeSchema),
    serviceCoverage: serviceCoverageSchema,
    createdAtUtc: utcDateTimeSchema,
    submittedAtUtc: utcDateTimeSchema.nullable(),
    supersedesVersionId: entityIdSchema.nullable(),
    withdrawnAtUtc: utcDateTimeSchema.nullable(),
    sourceTemplate: excelTemplateSchema.nullable(),
    priceTemplate: priceTemplateSchema.nullable(),
  })
  .strict();

export const awardSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    carrierCompanyId: entityIdSchema,
    bidVersionId: entityIdSchema,
    decidedByUserId: entityIdSchema,
    decision: z.enum(["confirmed", "cancelled"]),
    evaluationScoreBasisPoints: z.number().int().min(0).max(10_000).nullable(),
    selectionReason: z.string(),
    awardedAtUtc: utcDateTimeSchema,
    awardTemplate: excelTemplateSchema,
  })
  .strict();
