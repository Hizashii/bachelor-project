// Reads the carrier express workbook into the shared price model.
// It accepts .xlsx input only and never evaluates formulas from the upload.

import {
  type PriceTemplate,
  type PriceTemplateBand,
  parseDecimal,
  parseMinorUnits,
} from "@freight-desk/shared";
import ExcelJS from "exceljs";

const FIRST_BAND_ROW = 14;
const LAST_BAND_ROW = 31;
const ADDITIONAL_FEE_ROW = 37;
const RATE_COLUMN = { economy: 3, express: 4 } as const;
type ExcelWorkbookInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
export type PriceTemplateWorkbookInput = ExcelWorkbookInput;

export class PriceTemplateWorkbookError extends Error {}

export async function parsePriceTemplateWorkbook(
  input: ExcelWorkbookInput,
  fallbackVendorName = "Unnamed carrier",
): Promise<PriceTemplate> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const countries = workbook.worksheets
    .map((sheet) => parseCountrySheet(sheet))
    .filter(
      (country): country is NonNullable<typeof country> => country !== null,
    );
  if (countries.length === 0) {
    throw new PriceTemplateWorkbookError("No DK country sheets were found.");
  }
  const vendorName = readVendorName(workbook) ?? fallbackVendorName;
  return { vendorName, currency: "DKK", countries };
}

function parseCountrySheet(
  sheet: ExcelJS.Worksheet,
): PriceTemplate["countries"][number] | null {
  const match = /^DK-([A-Z]{2})$/.exec(sheet.name.trim().toUpperCase());
  if (!match) return null;
  const bands = [];
  for (let row = FIRST_BAND_ROW; row <= LAST_BAND_ROW; row += 1) {
    bands.push(readBand(sheet, row));
  }
  return {
    countryCode: match[1],
    bands,
    additionalFees: readAdditionalFees(sheet),
  };
}

function readBand(sheet: ExcelJS.Worksheet, row: number): PriceTemplateBand {
  const label = text(sheet.getCell(row, 2).value);
  const bounds = parseBandBounds(label);
  const economyMinor = readMoney(sheet, row, RATE_COLUMN.economy, label);
  const expressMinor = readMoney(sheet, row, RATE_COLUMN.express, label);
  return {
    label,
    fromKg: bounds.fromKg,
    toKg: bounds.toKg,
    economyMinor,
    expressMinor,
  };
}

function readMoney(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  label: string,
): number {
  const value = primitive(sheet.getCell(row, column).value);
  const amount = parseMinorUnits(value);
  if (amount === null) {
    throw new PriceTemplateWorkbookError(
      `Missing ${sheet.name} rate for ${label}.`,
    );
  }
  return amount;
}

function readAdditionalFees(
  sheet: ExcelJS.Worksheet,
): { name: string; amountMinor: number }[] {
  const fees: { name: string; amountMinor: number }[] = [];
  for (let row = ADDITIONAL_FEE_ROW; row <= sheet.rowCount; row += 1) {
    const name = text(sheet.getCell(row, 2).value);
    if (!name) continue;
    const amount = parseMinorUnits(primitive(sheet.getCell(row, 5).value));
    if (amount !== null) fees.push({ name, amountMinor: amount });
  }
  return fees;
}

function readVendorName(workbook: ExcelJS.Workbook): string | null {
  const sheet = workbook.getWorksheet("Total cost");
  if (!sheet) return null;
  const name = text(sheet.getCell(7, 3).value);
  return name || null;
}

function parseBandBounds(label: string): {
  fromKg: number;
  toKg: number | null;
} {
  const range = /^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/.exec(label);
  if (range) {
    return { fromKg: decimal(range[1]), toKg: decimal(range[2]) };
  }
  if (/^over\s+/i.test(label)) return { fromKg: 300, toKg: null };
  throw new PriceTemplateWorkbookError(`Invalid weight band: ${label}.`);
}

function decimal(value: string): number {
  const parsed = parseDecimal(value);
  if (parsed === null) throw new PriceTemplateWorkbookError("Invalid number.");
  return parsed;
}

function primitive(value: unknown): string | number | boolean | Date | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  return null;
}

function text(value: unknown): string {
  const raw = primitive(value);
  return raw === null ? "" : String(raw).trim();
}
