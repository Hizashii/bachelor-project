// Reads a shipment basis from S&A's express workbook: the shipment counts in column E and
// the economy share in column J of each country sheet. Formulas are never evaluated.

import ExcelJS from "exceljs";
import type { BasisCountry } from "./basis.ts";
import { PriceTemplateWorkbookError } from "./priceTemplateExcel.ts";

const FIRST_ROW = 14;
const LAST_ROW = 31;
const LABEL_COLUMN = 2;
const SHIPMENTS_COLUMN = 5;
const SHARE_COLUMN = 10;
const BASIS_POINTS_PER_UNIT = 10_000;
const BASIS_POINTS_PER_PERCENT = 100;
const MAX_PERCENT = 100;

type ExcelInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

export async function parseBasisWorkbook(
  input: ExcelInput,
): Promise<BasisCountry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const countries: BasisCountry[] = [];
  for (const sheet of workbook.worksheets) {
    const match = /^DK-([A-Z]{2})$/.exec(sheet.name.trim().toUpperCase());
    if (!match) continue;
    const rows = readRows(sheet);
    if (rows.some((row) => row.numberOfShipments > 0)) {
      countries.push({ countryCode: match[1] as string, rows });
    }
  }
  if (countries.length === 0) {
    throw new PriceTemplateWorkbookError(
      "No shipment counts were found in column E of the DK country sheets.",
    );
  }
  return countries;
}

function readRows(sheet: ExcelJS.Worksheet): BasisCountry["rows"] {
  const rows: BasisCountry["rows"] = [];
  for (let row = FIRST_ROW; row <= LAST_ROW; row += 1) {
    const label = String(sheet.getCell(row, LABEL_COLUMN).value ?? "").trim();
    const shipments = number(sheet.getCell(row, SHIPMENTS_COLUMN).value);
    if (!label || shipments === null || shipments === 0) continue;
    if (!Number.isInteger(shipments) || shipments < 0) {
      throw new PriceTemplateWorkbookError(
        `${sheet.name} row ${row}: shipments must be a whole number.`,
      );
    }
    rows.push({
      label,
      numberOfShipments: shipments,
      economyShareBasisPoints: readShare(sheet, row),
    });
  }
  return rows;
}

// Excel stores a percentage cell as a fraction (0.5 is 50 %). A plain 50 is read as 50 %.
function readShare(sheet: ExcelJS.Worksheet, row: number): number {
  const share = number(sheet.getCell(row, SHARE_COLUMN).value);
  if (share === null || share < 0 || share > MAX_PERCENT) {
    throw new PriceTemplateWorkbookError(
      `${sheet.name} row ${row}: % economy is missing or not between 0 and 100.`,
    );
  }
  return Math.round(
    share <= 1
      ? share * BASIS_POINTS_PER_UNIT
      : share * BASIS_POINTS_PER_PERCENT,
  );
}

function number(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
