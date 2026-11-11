// This file defines how a carrier's offer is stored: a bid version plus the carrier's own zones.
// Draft (draft.json) and submitted versions (v<n>.json) use the same shape.

import { z } from "zod";
import { bidVersionSchema } from "../schemas/business.ts";
import {
  entityIdSchema,
  nonNegativeIntegerSchema,
  postcodeRangeSchema,
  transportUnitSchema,
} from "../schemas/business-primitives.ts";

// A zone defined by the carrier. Coverage is by prefix ranges, explicit postcodes, or both.
export const carrierZoneSchema = z
  .object({
    id: entityIdSchema,
    code: z.string().min(1),
    name: z.string().min(1),
    originCountry: z.string().regex(/^[A-Z]{2}$/),
    destinationCountry: z.string().regex(/^[A-Z]{2}$/),
    originRanges: z.array(postcodeRangeSchema),
    destinationRanges: z.array(postcodeRangeSchema),
    destinationPostcodes: z.array(z.string().min(1)),
  })
  .strict();

export const offerNotesSchema = z
  .object({
    serviceDescription: z.string(),
    // Units this carrier prices in; a unit outside this list is never priced.
    supportedUnits: z.array(transportUnitSchema),
    minimumChargeMinor: nonNegativeIntegerSchema.nullable(),
  })
  .strict();

export const storedBidSchema = bidVersionSchema.extend({
  zones: z.array(carrierZoneSchema),
  notes: offerNotesSchema,
});

export type CarrierZone = z.infer<typeof carrierZoneSchema>;
export type OfferNotes = z.infer<typeof offerNotesSchema>;
export type StoredBid = z.infer<typeof storedBidSchema>;

// current.json: which submitted version is the effective one.
export const currentPointerSchema = z
  .object({
    versionNumber: z.number().int().positive(),
    bidVersionId: entityIdSchema,
    submittedAtUtc: z.string().datetime({ offset: true }),
  })
  .strict();

export type CurrentPointer = z.infer<typeof currentPointerSchema>;
