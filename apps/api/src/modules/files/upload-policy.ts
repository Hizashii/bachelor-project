import { z } from "zod";
import { ApiError } from "../../http/errors.ts";

const supportedContentTypes = [
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

const safeFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => value !== "." && value !== "..")
  .refine((value) => !value.includes("/") && !value.includes("\\"));

export const uploadMetadataSchema = z
  .object({
    fileName: safeFileNameSchema,
    contentType: z.enum(supportedContentTypes),
    declaredByteLength: z.number().int().nonnegative().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

export function validateUploadMetadata(
  input: unknown,
  maxBytes: number,
): UploadMetadata {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ApiError(
      "configuration_error",
      500,
      "The upload limit is not configured correctly.",
    );
  }

  const result = uploadMetadataSchema.safeParse(input);
  if (!result.success) {
    throw new ApiError("bad_request", 400, "The upload metadata is invalid.");
  }
  if (
    result.data.declaredByteLength !== undefined &&
    result.data.declaredByteLength > maxBytes
  ) {
    throw new ApiError(
      "payload_too_large",
      413,
      "The upload exceeds the configured size limit.",
    );
  }

  return result.data;
}
