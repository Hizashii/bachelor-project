import { describe, expect, it } from "vitest";
import { ApiError } from "../../http/errors.ts";
import { createBoundedUpload, verifyUploadDigest } from "./upload-stream.ts";

async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}

describe("bounded upload stream", () => {
  it("counts bytes and computes a server-side checksum", async () => {
    const upload = createBoundedUpload(
      chunks(new Uint8Array([1, 2]), new Uint8Array([3])),
      4,
    );

    const collected: number[] = [];
    for await (const chunk of upload.stream) collected.push(...chunk);

    expect(collected).toEqual([1, 2, 3]);
    expect(upload.byteLength()).toBe(3);
    expect(upload.sha256()).toBe(
      "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    );
  });

  it("aborts before yielding bytes beyond the server limit", async () => {
    const upload = createBoundedUpload(
      chunks(new Uint8Array([1, 2]), new Uint8Array([3])),
      2,
    );

    await expect(
      (async () => {
        for await (const chunk of upload.stream) {
          expect(chunk.byteLength).toBeGreaterThan(0);
        }
      })(),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a declared checksum that differs from the server checksum", () => {
    expect(() => verifyUploadDigest("a".repeat(64), "b".repeat(64))).toThrow(
      /checksum is invalid/,
    );
  });
});
