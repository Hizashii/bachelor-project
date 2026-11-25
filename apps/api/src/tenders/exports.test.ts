// These tests prove the template download and both export formats are usable.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { TenderComparison } from "./bidService.ts";
import { buildComparisonPdf, buildResultWorkbook } from "./exports.ts";
import { readTemplateFile } from "./templateFiles.ts";

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
  it("serves S&A's own express workbook with every country sheet", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await readTemplateFile("express-price")) as never,
    );

    expect(workbook.worksheets).toHaveLength(18);
    expect(workbook.getWorksheet("DK-DE")?.getCell("B14").value).toBe("0-1 kg");
  });

  it("writes the result as a new workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildResultWorkbook(comparison));

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Freight Desk result",
    ]);
    expect(workbook.worksheets[0]?.getCell("A2").value).toBe("Carrier A");
    expect(workbook.worksheets[0]?.getCell("D2").value).toBe(125);
  });

  it("creates a PDF document", async () => {
    const pdf = await buildComparisonPdf(comparison);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
