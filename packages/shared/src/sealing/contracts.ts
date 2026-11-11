// This file defines what the sealed-bid endpoints accept and return.
// It carries counts and reasons only, never prices or offer contents.

import { z } from "zod";

export const UNSEAL_REASON_MIN_LENGTH = 10;

export const unsealBodySchema = z
  .object({ reason: z.string().trim().min(UNSEAL_REASON_MIN_LENGTH) })
  .strict();

// Manual early close must be confirmed explicitly.
export const closeBodySchema = z.object({ confirm: z.literal(true) }).strict();

export const bidStatusSchema = z
  .object({
    invited: z.number().int().nonnegative(),
    submitted: z.number().int().nonnegative(),
    opened: z.boolean(),
  })
  .strict();

export type BidStatus = z.infer<typeof bidStatusSchema>;
