import { describe, expect, it } from "vitest";
import { stageUpload } from "./upload-service.ts";

async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}

describe("upload staging", () => {
  it("persists only a bounded temporary stream before SharePoint upload", async () => {
    const upload = await stageUpload(
      {
        organizationId: "consultancy-blue-fjord",
        metadata: {
          fileName: "fictional-rates.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        chunks: chunks(new Uint8Array([1, 2, 3])),
      },
      10,
    );

    try {
      const collected: number[] = [];
      for await (const chunk of upload.content) collected.push(...chunk);
      expect(collected).toEqual([1, 2, 3]);
      expect(upload.byteLength).toBe(3);
      expect(upload.sha256).toBe(
        "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      );
    } finally {
      await upload.dispose();
    }
  });

  it("rejects a checksum mismatch before returning a SharePoint upload", async () => {
    await expect(
      stageUpload(
        {
          organizationId: "consultancy-blue-fjord",
          metadata: {
            fileName: "fictional-rates.xlsx",
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sha256: "a".repeat(64),
          },
          chunks: chunks(new Uint8Array([1, 2, 3])),
        },
        10,
      ),
    ).rejects.toThrow(/checksum is invalid/);
  });

  it("rejects a declared size that differs from the staged content", async () => {
    await expect(
      stageUpload(
        {
          organizationId: "consultancy-blue-fjord",
          metadata: {
            fileName: "fictional-rates.xlsx",
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            declaredByteLength: 4,
          },
          chunks: chunks(new Uint8Array([1, 2, 3])),
        },
        10,
      ),
    ).rejects.toThrow(/declared upload size/);
  });
});
