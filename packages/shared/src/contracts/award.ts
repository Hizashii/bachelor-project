// This file defines the stored award and the export record.
// Internal notes never leave the consultant side; carriers get toCarrierView only.

import { z } from "zod";
import { awardSchema } from "../schemas/business.ts";
import {
  entityIdSchema,
  excelTemplateSchema,
  utcDateTimeSchema,
} from "../schemas/business-primitives.ts";
import { comparisonResultSchema } from "./comparison.ts";

export const noteSchema = z
  .object({
    id: entityIdSchema,
    byUserId: z.string().min(1),
    atUtc: utcDateTimeSchema,
    text: z.string().min(1).max(4000),
  })
  .strict();

export const awardRecordSchema = awardSchema.extend({
  evaluationSnapshot: comparisonResultSchema,
  recommendedBidVersionId: entityIdSchema.nullable(),
  internalNotes: z.array(noteSchema),
  negotiationNotes: z.array(noteSchema),
});

export const exportRecordSchema = z
  .object({
    id: entityIdSchema,
    tenderId: entityIdSchema,
    awardId: entityIdSchema,
    bidVersionId: entityIdSchema,
    template: excelTemplateSchema,
    createdByUserId: z.string().min(1),
    createdAtUtc: utcDateTimeSchema,
    fileName: z.string().min(1),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type Note = z.infer<typeof noteSchema>;
export type AwardRecord = z.infer<typeof awardRecordSchema>;
export type ExportRecord = z.infer<typeof exportRecordSchema>;
