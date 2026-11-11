// This file proves the rate file rules: exact money, safe text, template version and row messages.

import { describe, expect, it } from "vitest";
import { type BuildContext, buildBidFromRows } from "./buildBid.ts";
import { parseMinor } from "./normalize.ts";
import { IMPORT_COLUMNS, templateMarkerText } from "./template.ts";

const template = {
  id: "8f3d1b6e-7b6e-4c2e-9c8c-0a7b7e8c9da6",
  kind: "carrier_rate" as const,
  version: "1.0.0",
  fileName: "t.xlsx",
  checksumSha256: "a".repeat(64),
  status: "active" as const,
  approvedAtUtc: "2026-01-01T00:00:00Z",
};

function context(): BuildContext {
  let counter = 0;
  const newId = () =>
    `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  return {
    tender: {
      currency: "DKK",
      vatTreatment: "excluded",
      carrierRateTemplate: template,
    },
    base: {
      id: newId(),
      tenderId: newId(),
      carrierCompanyId: newId(),
      createdByUserId: newId(),
      versionNumber: 1,
      createdAtUtc: "2027-01-01T00:00:00Z",
    },
    newId,
  };
}

const header = IMPORT_COLUMNS.map((column) => column.header);
const goodRow = [
  "Z1",
  "Zone 1",
  "DK",
  "DK",
  "",
  "00-26; 30-36",
  "kg",
  "per 100 kg",
  "1",
  "50",
  "1.234,50",
  "DKK",
  "1-2",
  "Fuel",
  "fuel",
  "12,5%",
];

function sheet(...rows: string[][]): string[][] {
  return [["Template", templateMarkerText("1.0.0")], header, ...rows];
}

describe("buildBidFromRows", () => {
  it("builds exact minor units, basis points and ranges", () => {
    const { bid, issues } = buildBidFromRows(sheet(goodRow), context());
    expect(issues).toEqual([]);
    expect(bid?.rates[0]?.price).toEqual({
      amountMinor: 123450,
      currency: "DKK",
    });
    expect(bid?.rates[0]?.basis).toBe("per_100kg");
    expect(bid?.surcharges[0]?.calculation).toEqual({
      kind: "percentage",
      basisPoints: 1250,
    });
    expect(bid?.zones[0]?.destinationRanges).toHaveLength(2);
    expect(bid?.state).toBe("draft");
  });

  it("reports the row number and keeps formula-like text harmless", () => {
    const risky = [...goodRow];
    risky[1] = "=HYPERLINK(1)";
    expect(buildBidFromRows(sheet(risky), context()).bid?.zones[0]?.name).toBe(
      "'=HYPERLINK(1)",
    );
    const bad = [...goodRow];
    bad[10] = "abc";
    const { issues } = buildBidFromRows(sheet(goodRow, bad), context());
    expect(issues).toEqual([
      { row: 4, message: "Price is not a valid amount." },
    ]);
  });

  it("refuses a wrong template version and a different currency", () => {
    const wrong = sheet(goodRow);
    wrong[0] = ["Template", templateMarkerText("2.0.0")];
    expect(buildBidFromRows(wrong, context()).issues[0]?.row).toBe(1);
    const eur = [...goodRow];
    eur[11] = "EUR";
    expect(buildBidFromRows(sheet(eur), context()).issues[0]?.message).toMatch(
      /Currency/,
    );
  });

  it("never reads an ambiguous or missing price as a number", () => {
    expect(parseMinor("1.234")).toBeNull();
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("1.234.567,89")).toBe(123456789);
    expect(parseMinor("12.5")).toBe(1250);
  });
});
