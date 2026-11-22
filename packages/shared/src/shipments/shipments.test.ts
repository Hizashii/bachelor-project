// Tests for shipment cleaning, header mapping and row validation. All data is synthetic.

import { describe, expect, it } from "vitest";
import {
  normalisePostcode,
  parseDateTime,
  parseDecimal,
  parseMinorUnits,
} from "./clean.ts";
import { suggestMapping } from "./headers.ts";
import { cleanRow, DuplicateTracker } from "./validate.ts";

describe("number and money parsing", () => {
  it.each([
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["2,4", 2.4],
    ["2.400", 2400],
    ["12.5", 12.5],
    ["abc", null],
  ])("reads %s", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it("converts money to whole øre without float drift", () => {
    expect(parseMinorUnits("19,99")).toBe(1999);
    expect(parseMinorUnits("1.005,285")).toBe(100529);
    expect(parseMinorUnits("-5")).toBeNull();
  });
});

describe("dates and postcodes", () => {
  it("reads Danish and ISO dates", () => {
    expect(parseDateTime("05-03-2026 14:30")).toBe("2026-03-05T14:30");
    expect(parseDateTime("5.3.2026")).toBe("2026-03-05T00:00");
    expect(parseDateTime("2026-03-05")).toBe("2026-03-05T00:00");
  });

  it("rejects impossible dates", () => {
    expect(parseDateTime("31-02-2026")).toBeNull();
  });

  it("accepts four and five digit postcodes with a country prefix", () => {
    expect(normalisePostcode("DK-8300")).toBe("8300");
    expect(normalisePostcode("12")).toBeNull();
  });
});

describe("header mapping", () => {
  it("maps Danish headers and flags partial matches as uncertain", () => {
    const { mapping, uncertain } = suggestMapping([
      "Forsendelsesnr",
      "Fra postnr",
      "Til postnr",
      "Vægt (kg)",
      "Samlet fragtpris DKK",
    ]);
    expect(mapping).toMatchObject({
      reference: 0,
      originPostcode: 1,
      destinationPostcode: 2,
      weightKg: 3,
      quotedCostMinor: 4,
    });
    expect(uncertain).toEqual(["quotedCostMinor"]);
  });
});

describe("row cleaning", () => {
  const headers = ["Ref", "Fra", "Til", "Vægt (ton)", "Afhentning", "Levering"];
  const mapping = suggestMapping(["Ref", "Fra postnr", "Til postnr"]).mapping;
  const context = {
    headers,
    mapping: { ...mapping, weightKg: 3, collectionAt: 4, deliveryAt: 5 },
  };

  it("cleans a valid row and converts tonnes to kg", () => {
    const row = ["S-1", "8300", "2680", "1,5", "05-03-2026", "06-03-2026"];
    const { shipment, issues } = cleanRow(row, 2, context);
    expect(issues).toEqual([]);
    expect(shipment.weightKg).toBe(1500);
  });

  it("reports missing, invalid and inconsistent values", () => {
    const row = ["", "83", "2680", "-3", "06-03-2026", "05-03-2026"];
    const kinds = cleanRow(row, 3, context).issues.map(
      (issue) => `${issue.field}:${issue.kind}`,
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        "originPostcode:invalid",
        "weightKg:invalid",
        "deliveryAt:inconsistent",
        "reference:missing",
      ]),
    );
  });

  it("flags a repeated reference once per extra use", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.check("S-1", 2)).toBeNull();
    expect(tracker.check("s-1", 3)).toEqual({
      row: 3,
      field: "reference",
      kind: "duplicate",
    });
  });
});
