// Tests for reading a zones-by-brackets rate grid. The sheet content is synthetic.

import { describe, expect, it } from "vitest";
import { importRateMatrix } from "./importMatrix.ts";

const grid = [
  ["Pris pr. 100 kg", "Zone A (00-26)", "Zone B (30-36, 40-45)"],
  ["0-100", "200,50", "300"],
  ["101-200", "150", ""],
  ["200+", "n/a", "250"],
];

describe("importRateMatrix", () => {
  const result = importRateMatrix(grid);

  it("reads zones with their postcode ranges and suggests the method", () => {
    expect(result.suggestedMethod).toBe("per_100kg");
    expect(result.zones.map((z) => z.name)).toEqual(["Zone A", "Zone B"]);
    expect(result.zones[1]?.ranges).toEqual([
      { from: "30", to: "36" },
      { from: "40", to: "45" },
    ]);
  });

  it("builds contiguous brackets with an open last bracket", () => {
    expect(result.brackets).toEqual([
      { from: 0, to: 100 },
      { from: 100, to: 200 },
      { from: 200, to: null },
    ]);
  });

  it("stores rates as whole øre and flags blank or unreadable cells", () => {
    expect(result.rates[0]?.amountMinor).toBe(20_050);
    const codes = result.ambiguities.map(
      (a) => `${a.row}:${a.column}:${a.code}`,
    );
    expect(codes).toEqual(["3:3:blank_rate", "4:2:unreadable_rate"]);
    expect(result.rates.filter((r) => r.amountMinor === null)).toHaveLength(2);
  });
});
