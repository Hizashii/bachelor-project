// This file checks request data with the shared Zod schemas and turns failures into friendly errors.
// Details name the field only; they never echo the submitted value.

import type { ZodType } from "zod";
import { AppError } from "../errors.ts";

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  throw new AppError("VALIDATION_FAILED", "Some fields need fixing.", details);
}
