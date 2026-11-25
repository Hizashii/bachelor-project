// These tests prove a workspace draft becomes the same price model an uploaded workbook gives.

import { verifiedTemplateView } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import { draftToPriceTemplate } from "./draftPriceTemplate.ts";

function countryValues(sheetName: string, economy: string, express: string) {
  const sheet = verifiedTemplateView("express-price").sheets.find(
    (item) => item.name === sheetName,
  );
  const values: Record<string, string> = {};
  const rows = sheet?.sections[0]?.rows.filter((row) => row.kind === "matrix");
  for (const row of rows ?? []) {
    values[`express-price|${sheetName}|C${row.sourceRow}`] = economy;
    values[`express-price|${sheetName}|D${row.sourceRow}`] = express;
  }
  return values;
}

describe("draft to price template", () => {
  it("prices a completed country and skips countries left empty", () => {
    const template = draftToPriceTemplate(
      {
        ...countryValues("DK-DE", "42,5", "68"),
        "express-price|DK-DE|C7": "Carrier X",
        "express-price|DK-DE|E37": "150",
      },
      "fallback",
    );

    expect(template.vendorName).toBe("Carrier X");
    expect(template.countries.map((c) => c.countryCode)).toEqual(["DE"]);
    expect(template.countries[0]?.bands).toHaveLength(18);
    expect(template.countries[0]?.bands[0]).toMatchObject({
      economyMinor: 4_250,
      expressMinor: 6_800,
    });
    expect(template.countries[0]?.additionalFees).toEqual([
      { name: "Fixed am delivery (before 10.00)", amountMinor: 15_000 },
    ]);
  });

  it("names the country and band when a price is missing", () => {
    const values = countryValues("DK-SE", "40", "60");
    values["express-price|DK-SE|D20"] = "";

    expect(() => draftToPriceTemplate(values, "x")).toThrow(/DK-SE.*25-30 kg/);
  });

  it("refuses an empty draft", () => {
    expect(() => draftToPriceTemplate({}, "x")).toThrow(/at least one country/);
  });

  it("refuses a price that reads two ways instead of guessing", () => {
    const values = countryValues("DK-DE", "40", "60");
    values["express-price|DK-DE|C14"] = "1,500";

    expect(() => draftToPriceTemplate(values, "x")).toThrow(/DK-DE.*two ways/);
  });

  it("does not drop a country or a fee that holds text instead of a number", () => {
    const typo = countryValues("DK-FR", "abc", "abc");
    expect(() => draftToPriceTemplate(typo, "x")).toThrow(
      /DK-FR.*not a number/,
    );

    const fee = {
      ...countryValues("DK-FR", "40", "60"),
      "express-price|DK-FR|E37": "fifty",
    };
    expect(() => draftToPriceTemplate(fee, "x")).toThrow(/DK-FR.*fifty/);
  });
});
