// Writes processed rows to a CSV or XLSX file, one row at a time.
// CSV text that starts with = + - @ gets a leading apostrophe so Excel cannot run it.
// Not for choosing which columns to write: see processShipments.ts.

import { once } from "node:events";
import { createWriteStream, type WriteStream } from "node:fs";
import ExcelJS from "exceljs";

export type OutputCell = string | number | null;
export type OutputFormat = "csv" | "xlsx";

export interface RowSink {
  write(cells: OutputCell[]): Promise<void>;
  close(): Promise<void>;
}

const CSV_DELIMITER = ";";
const FORMULA_START = /^[=+\-@\t\r]/;

export function openSink(path: string, format: OutputFormat): RowSink {
  return format === "csv" ? new CsvSink(path) : new XlsxSink(path);
}

export function csvCell(cell: OutputCell): string {
  if (cell === null) return "";
  const text =
    typeof cell === "string" && FORMULA_START.test(cell)
      ? `'${cell}`
      : String(cell);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

class CsvSink implements RowSink {
  private readonly stream: WriteStream;
  private failure: Error | null = null;

  constructor(path: string) {
    this.stream = createWriteStream(path);
    this.stream.write("\uFEFF");
  }

  async write(cells: OutputCell[]): Promise<void> {
    const line = `${cells.map(csvCell).join(CSV_DELIMITER)}\r\n`;
    if (!this.stream.write(line)) await once(this.stream, "drain");
  }

  async close(): Promise<void> {
    if (this.failure) throw this.failure;
    this.stream.end();
    await once(this.stream, "finish");
  }
}

class XlsxSink implements RowSink {
  private readonly book: ExcelJS.stream.xlsx.WorkbookWriter;
  private readonly sheet: ExcelJS.Worksheet;

  constructor(path: string) {
    this.book = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path });
    this.sheet = this.book.addWorksheet("Shipments");
  }

  async write(cells: OutputCell[]): Promise<void> {
    this.sheet.addRow(cells).commit();
  }

  async close(): Promise<void> {
    this.sheet.commit();
    await this.book.commit();
  }
}
