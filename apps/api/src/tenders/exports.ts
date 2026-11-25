// Builds downloadable Excel and PDF tender results.
// It writes new export files and never overwrites the supplied source workbooks.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { TenderComparison } from "./bidService.ts";

type ExcelInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
export type ExcelOutput = Awaited<
  ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>
>;

const COUNTRY_CODES = [
  "BE",
  "CN",
  "DE",
  "EE",
  "FI",
  "FR",
  "ID",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "NL",
  "NO",
  "SE",
  "SI",
  "VN",
] as const;

const PRICE_BANDS = [
  ["0-1 kg", 0, 1],
  ["1-5 kg", 1, 5],
  ["5-10 kg", 5, 10],
  ["10-15 kg", 10, 15],
  ["15-20 kg", 15, 20],
  ["20-25 kg", 20, 25],
  ["25-30 kg", 25, 30],
  ["30-35 kg", 30, 35],
  ["35-40 kg", 35, 40],
  ["40-45 kg", 40, 45],
  ["45-50 kg", 45, 50],
  ["50-75 kg", 50, 75],
  ["75-100 kg", 75, 100],
  ["100-150 kg", 100, 150],
  ["150-200 kg", 150, 200],
  ["200-250 kg", 200, 250],
  ["250-300 kg", 250, 300],
  ["Over 300 kg", 300, null],
] as const;

const FEE_NAMES = [
  "Fixed am delivery (before 10.00)",
  "Fixed am delivery (before 12.00)",
  "Waiting time per 15 min after 15 min",
] as const;

export async function buildPriceTemplateWorkbook(): Promise<ExcelOutput> {
  const workbook = new ExcelJS.Workbook();
  addTotalCostSheet(workbook);
  for (const countryCode of COUNTRY_CODES)
    addCountrySheet(workbook, countryCode);
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook.xlsx.writeBuffer();
}

export async function buildBiddingWorkbook(
  comparison: TenderComparison,
): Promise<ExcelOutput> {
  const workbook = new ExcelJS.Workbook();
  const source = await readLocalTemplate("bidding.xlsx");
  if (source) await workbook.xlsx.load(source);
  addComparisonSheet(workbook, comparison);
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook.xlsx.writeBuffer();
}

export function buildComparisonPdf(
  comparison: TenderComparison,
): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    writePdfContent(document, comparison);
    document.end();
  });
}

function addTotalCostSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet("Total cost");
  sheet.getCell("B2").value = "Total cost UMAGE";
  sheet.getCell("B7").value = "Vendor name:";
  sheet.getCell("B13").value = "Country";
  sheet.getCell("C13").value = "Number of shipments";
  sheet.getCell("D13").value = "Total costs, DKK";
  COUNTRY_CODES.forEach((countryCode, index) => {
    const row = 14 + index;
    sheet.getCell(row, 2).value = countryCode;
    sheet.getCell(row, 3).value = {
      formula: `'DK-${countryCode}'!E32`,
      result: 0,
    };
    sheet.getCell(row, 4).value = {
      formula: `'DK-${countryCode}'!F32`,
      result: 0,
    };
  });
  sheet.getCell("B31").value = "Total";
  sheet.getCell("C31").value = { formula: "SUM(C14:C30)", result: 0 };
  sheet.getCell("D31").value = { formula: "SUM(D14:D30)", result: 0 };
}

function addCountrySheet(
  workbook: ExcelJS.Workbook,
  countryCode: string,
): void {
  const sheet = workbook.addWorksheet(`DK-${countryCode}`);
  sheet.getCell("B2").value = "Parcel distribution";
  sheet.getCell("B13").value = "Weight";
  sheet.getCell("C13").value = "Economy";
  sheet.getCell("D13").value = "Express";
  sheet.getCell("E13").value = "Number of shipments";
  sheet.getCell("F13").value = "Total";
  sheet.getCell("J13").value = "% Economy";
  PRICE_BANDS.forEach(([label], index) => {
    addBandRow(sheet, label, 14 + index);
  });
  sheet.getCell("B32").value = "Total";
  sheet.getCell("E32").value = { formula: "SUM(E14:E31)", result: 0 };
  sheet.getCell("F32").value = { formula: "SUM(F14:F31)", result: 0 };
  addFeeRows(sheet);
}

function addBandRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  row: number,
): void {
  sheet.getCell(row, 2).value = label;
  sheet.getCell(row, 6).value = {
    formula: `(E${row}*J${row}*C${row})+(E${row}*(1-J${row})*D${row})`,
    result: 0,
  };
  sheet.getCell(row, 3).numFmt = "0.00";
  sheet.getCell(row, 4).numFmt = "0.00";
  sheet.getCell(row, 10).numFmt = "0%";
}

function addFeeRows(sheet: ExcelJS.Worksheet): void {
  sheet.getCell("B36").value = "Additional fee";
  sheet.getCell("E36").value = "Cost (DKK)";
  FEE_NAMES.forEach((name, index) => {
    sheet.getCell(37 + index, 2).value = name;
    sheet.getCell(37 + index, 5).numFmt = "0.00";
  });
}

function addComparisonSheet(
  workbook: ExcelJS.Workbook,
  comparison: TenderComparison,
): void {
  const existing = workbook.getWorksheet("Freight Desk result");
  if (existing) workbook.removeWorksheet(existing.id);
  const sheet = workbook.addWorksheet("Freight Desk result");
  sheet.addRow([
    "Carrier",
    "Bid version",
    "Currency",
    "Total DKK",
    "Status",
    "Message",
  ]);
  for (const candidate of comparison.candidates) {
    const result = candidate.result;
    sheet.addRow([
      candidate.vendorName ?? candidate.carrierCompanyId,
      candidate.bidVersionId,
      comparison.currency,
      result ? result.totalMinor / 100 : null,
      result ? "Priced" : "Unpriced",
      candidate.error ?? "",
    ]);
  }
  sheet.getColumn(4).numFmt = "#,##0.00";
  sheet.getRow(1).font = { bold: true };
}

function writePdfContent(
  document: PDFKit.PDFDocument,
  comparison: TenderComparison,
): void {
  document.fontSize(18).text("Tender comparison");
  document.moveDown().fontSize(10).text(`Tender: ${comparison.tenderId}`);
  document.text(`Currency: ${comparison.currency}`);
  document.moveDown();
  comparison.candidates.forEach((candidate, index) => {
    const amount = candidate.result
      ? `${(candidate.result.totalMinor / 100).toFixed(2)} ${comparison.currency}`
      : "Unpriced";
    document
      .fontSize(11)
      .text(
        `${index + 1}. ${candidate.vendorName ?? candidate.carrierCompanyId}: ${amount}`,
      );
    if (candidate.error) document.fontSize(9).text(`   ${candidate.error}`);
  });
}

async function readLocalTemplate(name: string): Promise<ExcelInput | null> {
  try {
    const path = join(process.cwd(), "database", "excel", name);
    return (await readFile(path)) as unknown as ExcelInput;
  } catch {
    return null;
  }
}
