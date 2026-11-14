import { createHash } from "node:crypto";
import { ApiError } from "../../http/errors.ts";

export type BoundedUpload = {
  stream: AsyncIterable<Uint8Array>;
  byteLength: () => number;
  sha256: () => string | undefined;
};

export function createBoundedUpload(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number,
): BoundedUpload {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ApiError(
      "configuration_error",
      500,
      "The upload limit is not configured correctly.",
    );
  }

  let byteLength = 0;
  let digest: string | undefined;
  let complete = false;

  const stream = (async function* (): AsyncGenerator<Uint8Array> {
    const hash = createHash("sha256");
    for await (const chunk of chunks) {
      if (!(chunk instanceof Uint8Array)) {
        throw new ApiError("bad_request", 400, "The upload stream is invalid.");
      }
      if (chunk.byteLength > maxBytes - byteLength) {
        throw new ApiError(
          "payload_too_large",
          413,
          "The upload exceeds the configured size limit.",
        );
      }
      byteLength += chunk.byteLength;
      hash.update(chunk);
      yield chunk;
    }
    digest = hash.digest("hex");
    complete = true;
  })();

  return {
    stream,
    byteLength: () => byteLength,
    sha256: () => (complete ? digest : undefined),
  };
}

export function verifyUploadDigest(
  declaredDigest: string | undefined,
  actualDigest: string | undefined,
): void {
  if (declaredDigest !== undefined && declaredDigest !== actualDigest) {
    throw new ApiError("bad_request", 400, "The upload checksum is invalid.");
  }
}
