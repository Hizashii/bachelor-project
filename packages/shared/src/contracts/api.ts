// This file defines the error codes, error body and signed-in person shared by server and screens.
// It is not where feature rules live; those stay in each feature.

import { z } from "zod";
import {
  entityIdSchema,
  userRoleSchema,
} from "../schemas/business-primitives.ts";

export const API_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  DEADLINE_PASSED: 409,
  TENDER_NOT_OPEN: 409,
  BID_SEALED: 403,
  INVALID_STATE: 409,
  UPLOAD_REJECTED: 422,
  RATE_LIMITED: 429,
  LOCKED: 423,
  UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const apiErrorCodeSchema = z.enum(
  Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]],
);

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string(),
        details: z
          .array(z.object({ path: z.string(), message: z.string() }).strict())
          .optional(),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;

// The signed-in person. Always built by the server from the session, never from a request.
export const principalSchema = z
  .object({
    userId: z.string().min(1),
    role: userRoleSchema,
    carrierCompanyId: entityIdSchema.nullable(),
  })
  .strict();

export type Principal = z.infer<typeof principalSchema>;
