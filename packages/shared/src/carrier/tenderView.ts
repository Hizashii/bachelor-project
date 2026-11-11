// This file defines what a carrier may see of a tender: its public facts and its own offer status.
// It is not the stored tender, so internal fields and other carriers can never leak through it.

import { z } from "zod";
import {
  currencyCodeSchema,
  entityIdSchema,
  tenderStatusSchema,
  utcDateTimeSchema,
  vatTreatmentSchema,
} from "../schemas/business-primitives.ts";

export const carrierSubmissionSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }).strict(),
  z.object({ state: z.literal("draft") }).strict(),
  z
    .object({
      state: z.literal("submitted"),
      versionNumber: z.number().int().positive(),
      submittedAtUtc: utcDateTimeSchema,
    })
    .strict(),
]);

export const carrierTenderSchema = z
  .object({
    id: entityIdSchema,
    name: z.string().min(1),
    customerReference: z.string().min(1),
    status: tenderStatusSchema,
    deadlineUtc: utcDateTimeSchema,
    customerTimeZone: z.string().min(1),
    currency: currencyCodeSchema,
    vatTreatment: vatTreatmentSchema,
    submission: carrierSubmissionSchema,
  })
  .strict();

export const carrierTenderListSchema = z
  .object({ tenders: z.array(carrierTenderSchema) })
  .strict();

export const carrierTenderFilterSchema = z
  .object({ status: z.enum(["active", "closed"]).optional() })
  .strip();

export type CarrierSubmission = z.infer<typeof carrierSubmissionSchema>;
export type CarrierTender = z.infer<typeof carrierTenderSchema>;
export type CarrierTenderFilter = z.infer<typeof carrierTenderFilterSchema>;
