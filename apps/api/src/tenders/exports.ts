// Builds downloadable Excel and PDF tender results.
// Each export is a new file; S&A's own workbooks are never written to.

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { TenderComparison } from "./bidService.ts";

export type ExcelOutput = Awaited<
  ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>
>;

export async function buildResultWorkbook(
  comparison: TenderComparison,
): Promise<ExcelOutput> {
  const workbook = new ExcelJS.Workbook();
  addComparisonSheet(workbook, comparison);
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
