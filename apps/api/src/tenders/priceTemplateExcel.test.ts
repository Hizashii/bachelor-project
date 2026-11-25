// These tests prove the API maps the carrier workbook cells without running formulas.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { fillExpressTemplate } from "../testing/expressWorkbooks.ts";
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

describe("real express template", () => {
  const prices = {
    vendorName: "Test Carrier North",
    economyFrom: 42,
    expressFrom: 68,
    bandStep: 3.5,
    feeAmount: 150,
  };

  it("reads every country, band and fee from the filled workbook", async () => {
    const buffer = await fillExpressTemplate(prices);
    const result = await parsePriceTemplateWorkbook(buffer as never);

    expect(result.vendorName).toBe("Test Carrier North");
    expect(result.countries).toHaveLength(17);
    const germany = result.countries.find((c) => c.countryCode === "DE");
    expect(germany?.bands).toHaveLength(18);
    expect(germany?.bands[0]).toMatchObject({
      economyMinor: 4_200,
      expressMinor: 6_800,
    });
    expect(germany?.bands[0]?.pickupMinor).toBe(2_100);
    expect(germany?.bands[17]).toMatchObject({
      economyMinor: 10_150,
      expressMinor: 12_750,
    });
    expect(germany?.additionalFees).toHaveLength(3);
    expect(
      result.countries.find((c) => c.countryCode === "ID")?.additionalFees,
    ).toHaveLength(5);
  });

  it("names the sheet when a price is missing or not a number", async () => {
    const missing = await fillExpressTemplate(prices, {
      kind: "missing-price",
      sheet: "DK-DE",
      row: 14,
    });
    await expect(parsePriceTemplateWorkbook(missing as never)).rejects.toThrow(
      /DK-DE.*0-1 kg/,
    );
    const text = await fillExpressTemplate(prices, {
      kind: "text-price",
      sheet: "DK-SE",
      row: 20,
    });
    await expect(parsePriceTemplateWorkbook(text as never)).rejects.toThrow(
      /DK-SE/,
    );
  });

  it("rejects a workbook without the country sheets", async () => {
    const wrong = await fillExpressTemplate(prices, {
      kind: "wrong-sheet-names",
    });
    await expect(parsePriceTemplateWorkbook(wrong as never)).rejects.toThrow(
      /No DK country sheets/,
    );
  });
});
