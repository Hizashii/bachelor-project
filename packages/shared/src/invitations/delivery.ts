// This file defines the shapes for invitation delivery results and company contact emails.
// It is not where mail is sent; that lives in the API.

import { z } from "zod";
import {
  entityIdSchema,
  utcDateTimeSchema,
} from "../schemas/business-primitives.ts";

export const deliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
  "duplicate",
]);

export const invitationDeliverySchema = z
  .object({
    invitationId: entityIdSchema,
    status: deliveryStatusSchema,
    attempts: z.number().int().nonnegative(),
    resends: z.number().int().nonnegative(),
    lastErrorCode: z.string().nullable(),
    lastAttemptAtUtc: utcDateTimeSchema.nullable(),
    deliveredAtUtc: utcDateTimeSchema.nullable(),
  })
  .strict();

export const companyContactSchema = z
  .object({ inviteEmail: z.string().email() })
  .strict();

export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;
export type InvitationDelivery = z.infer<typeof invitationDeliverySchema>;
export type CompanyContact = z.infer<typeof companyContactSchema>;
