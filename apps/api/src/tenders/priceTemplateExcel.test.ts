// These tests prove the API maps the carrier workbook cells without running formulas.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  PriceTemplateWorkbookError,
  parsePriceTemplateWorkbook,
} from "./priceTemplateExcel.ts";

type ExcelWorkbookInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

async function workbookBuffer(rate = 100): Promise<ExcelWorkbookInput> {
  const workbook = new ExcelJS.Workbook();
  const total = workbook.addWorksheet("Total cost");
  total.getCell("C7").value = "Carrier A";
  const sheet = workbook.addWorksheet("DK-DE");
  sheet.getCell("B14").value = "0-1 kg";
  sheet.getCell("C14").value = rate;
  sheet.getCell("D14").value = rate + 50;
  for (let row = 15; row <= 31; row += 1) {
    sheet.getCell(row, 2).value =
      row === 31 ? "Over 300 kg" : `${row - 13}-${row - 12} kg`;
    sheet.getCell(row, 3).value = rate;
    sheet.getCell(row, 4).value = rate + 50;
  }
  return (await workbook.xlsx.writeBuffer()) as unknown as ExcelWorkbookInput;
}

describe("price template workbook reader", () => {
  it("reads country bands and converts DKK cells to øre", async () => {
    const result = await parsePriceTemplateWorkbook(await workbookBuffer());

    expect(result.vendorName).toBe("Carrier A");
    expect(result.countries[0]?.countryCode).toBe("DE");
    expect(result.countries[0]?.bands[0]).toMatchObject({
      label: "0-1 kg",
      economyMinor: 10_000,
      expressMinor: 15_000,
    });
  });

  it("rejects a country sheet with a missing rate", async () => {
    await expect(
      parsePriceTemplateWorkbook(await workbookBuffer(Number.NaN)),
    ).rejects.toBeInstanceOf(PriceTemplateWorkbookError);
  });
});
