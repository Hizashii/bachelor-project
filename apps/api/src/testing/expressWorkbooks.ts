// Builds carrier test workbooks by filling in S&A's real express template.
// The numbers are made up; only the cells carriers are meant to fill are written.

import ExcelJS from "exceljs";
import { readTemplateFile } from "../tenders/templateFiles.ts";

const FIRST_BAND_ROW = 14;
const LAST_BAND_ROW = 31;
const FIRST_FEE_ROW = 37;
const LAST_FEE_ROW = 41;

export type CarrierPrices = {
  vendorName: string;
  economyFrom: number;
  expressFrom: number;
  bandStep: number;
  feeAmount: number;
};

export type WorkbookFault =
  | { kind: "missing-price"; sheet: string; row: number }
  | { kind: "text-price"; sheet: string; row: number }
  | { kind: "wrong-sheet-names" };

export async function fillExpressTemplate(
  prices: CarrierPrices,
  fault?: WorkbookFault,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await readTemplateFile("express-price")) as unknown as ArrayBuffer,
  );
  const total = workbook.getWorksheet("Total cost");
  if (total) total.getCell("C7").value = prices.vendorName;
  for (const sheet of workbook.worksheets) {
    if (sheet.name.startsWith("DK-")) fillCountrySheet(sheet, prices);
  }
  applyFault(workbook, fault);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function fillCountrySheet(
  sheet: ExcelJS.Worksheet,
  prices: CarrierPrices,
): void {
  for (let row = FIRST_BAND_ROW; row <= LAST_BAND_ROW; row += 1) {
    const step = (row - FIRST_BAND_ROW) * prices.bandStep;
    sheet.getCell(row, 3).value = prices.economyFrom + step;
    sheet.getCell(row, 4).value = prices.expressFrom + step;
    sheet.getCell(row, 8).value = prices.economyFrom / 2 + step;
  }
  for (let row = FIRST_FEE_ROW; row <= LAST_FEE_ROW; row += 1) {
    if (sheet.getCell(row, 2).value) {
      sheet.getCell(row, 5).value = prices.feeAmount;
    }
  }
}

function applyFault(workbook: ExcelJS.Workbook, fault?: WorkbookFault): void {
  if (!fault) return;
  if (fault.kind === "wrong-sheet-names") {
    for (const sheet of workbook.worksheets) {
      if (sheet.name.startsWith("DK-")) sheet.name = `X-${sheet.name.slice(3)}`;
    }
    return;
  }
  const cell = workbook.getWorksheet(fault.sheet)?.getCell(fault.row, 3);
  if (cell) cell.value = fault.kind === "missing-price" ? null : "ask us";
}
