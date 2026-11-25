// These tests prove both export formats contain a usable tender result.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { TenderComparison } from "./bidService.ts";
import {
  buildBiddingWorkbook,
  buildComparisonPdf,
  buildPriceTemplateWorkbook,
} from "./exports.ts";

const comparison: TenderComparison = {
  tenderId: "11111111-1111-4111-8111-111111111111",
  currency: "DKK",
  candidates: [
    {
      carrierCompanyId: "22222222-2222-4222-8222-222222222222",
      bidVersionId: "33333333-3333-4333-8333-333333333333",
      vendorName: "Carrier A",
      result: { currency: "DKK", totalMinor: 12_500, lines: [] },
      error: null,
    },
  ],
};

describe("tender exports", () => {
  it("creates the carrier price workbook with all country sheets and formulas", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildPriceTemplateWorkbook());

    expect(workbook.worksheets).toHaveLength(18);
    expect(workbook.getWorksheet("DK-DE")?.getCell("F14").value).toMatchObject({
      formula: expect.stringContaining("E14*J14*C14"),
    });
  });

  it("adds a comparison result sheet to the bidding workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildBiddingWorkbook(comparison));

    expect(
      workbook.getWorksheet("Freight Desk result")?.getCell("A2").value,
    ).toBe("Carrier A");
    expect(
      workbook.getWorksheet("Freight Desk result")?.getCell("D2").value,
    ).toBe(125);
  });

  it("creates a PDF document", async () => {
    const pdf = await buildComparisonPdf(comparison);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
