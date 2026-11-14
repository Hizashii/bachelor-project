import { describe, expect, it } from "vitest";
import { validateUploadMetadata } from "./upload-policy.ts";

const validUpload = {
  fileName: "northern-denmark.xlsx",
  contentType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
  declaredByteLength: 1_024,
};

describe("upload policy", () => {
  it("accepts a supported file inside the limit", () => {
    expect(validateUploadMetadata(validUpload, 2_048)).toEqual(validUpload);
  });

  it("rejects path traversal in a client-provided file name", () => {
    expect(() =>
      validateUploadMetadata(
        { ...validUpload, fileName: "../rates.xlsx" },
        2_048,
      ),
    ).toThrow(/metadata is invalid/);
  });

  it("rejects files larger than the server limit", () => {
    expect(() => validateUploadMetadata(validUpload, 512)).toThrow(
      /exceeds the configured size limit/,
    );
  });
});
