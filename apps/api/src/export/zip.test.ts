import { describe, expect, it } from "vitest";
import { readZip, writeZip } from "./zip.ts";

describe("workbook archive handling", () => {
  it("round-trips stored and compressed entries", () => {
    const entries = [
      {
        name: "[Content_Types].xml",
        data: new TextEncoder().encode("content"),
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: new TextEncoder().encode("worksheet"),
      },
    ];

    const roundTripped = readZip(writeZip(entries));

    expect(roundTripped.map((entry) => entry.name)).toEqual([
      "[Content_Types].xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(new TextDecoder().decode(roundTripped[1].data)).toBe("worksheet");
  });
});
