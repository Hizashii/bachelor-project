// This test proves the shared package test setup is working.
import { describe, expect, it } from "vitest";
import { findZoneForPostcode, validateZoneRanges } from "./pricing/index.js";

describe("shared package", () => {
  it("maps postcode prefixes to the workbook zone", () => {
    const zones = [
      { from: "00", to: "26", name: "Zone 1" },
      { from: "30", to: "36", name: "Zone 2" },
    ];

    expect(findZoneForPostcode("2680", zones)).toBe("Zone 1");
    expect(findZoneForPostcode("3000", zones)).toBe("Zone 2");
    expect(findZoneForPostcode("2700", zones)).toBeNull();
  });

  it("accepts a single prefix and rejects overlapping ranges", () => {
    const valid = validateZoneRanges([
      { from: "28", to: "", name: "Zone 1" },
      { from: "30", to: "36", name: "Zone 2" },
    ]);
    const invalid = validateZoneRanges([
      { from: "00", to: "26", name: "Zone 1" },
      { from: "26", to: "30", name: "Zone 2" },
    ]);

    expect(valid.valid).toBe(true);
    expect(invalid.noOverlaps).toBe(false);
    expect(invalid.valid).toBe(false);
  });

  it("rejects ranges with a missing name or reversed bounds", () => {
    const result = validateZoneRanges([
      { from: "40", to: "39", name: "Zone 1" },
      { from: "41", to: "42", name: "" },
    ]);

    expect(result.validRanges).toBe(false);
    expect(result.allMapped).toBe(false);
    expect(result.valid).toBe(false);
  });
});
