// Reads the rows of an uploaded XLSX or CSV file one at a time, never the whole file.
// Formulas are never run: only the value Excel stored is used.
// Not for cleaning values: see packages/shared/src/shipments.

import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { RawCell } from "@freight-desk/shared";
import ExcelJS from "exceljs";
import { type CsvDelimiter, CsvParser, sniffDelimiter } from "./csv.ts";
import { importLimits } from "./limits.ts";

export type FileKind = "xlsx" | "csv";

export type ReadOptions = {
  kind: FileKind;
  delimiter?: CsvDelimiter;
  encoding?: "utf-8" | "windows-1252";
};

export class UnreadableFileError extends Error {}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const SAMPLE_BYTES = 64 * 1024;

export async function detectFileKind(path: string): Promise<FileKind> {
  const { size } = await stat(path);
  if (size === 0) throw new UnreadableFileError("The file is empty.");
  if (size > importLimits.maxFileBytes) {
    throw new UnreadableFileError("The file is larger than the allowed size.");
  }
  const sample = await readSample(path);
  if (ZIP_SIGNATURE.every((byte, index) => sample[index] === byte)) {
    return "xlsx";
  }
  if (sample.includes(0)) {
    throw new UnreadableFileError("Only .xlsx and .csv files are supported.");
  }
  return "csv";
}

async function readSample(path: string): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(SAMPLE_BYTES),
      0,
      SAMPLE_BYTES,
      0,
    );
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function* readRows(
  path: string,
  options: ReadOptions,
): AsyncGenerator<RawCell[]> {
  const rows =
    options.kind === "xlsx" ? readXlsx(path) : readCsv(path, options);
  let count = 0;
  for await (const row of rows) {
    count += 1;
    if (count > importLimits.maxRows) {
      throw new UnreadableFileError("The file has too many rows.");
    }
    yield row.slice(0, importLimits.maxSheetColumns);
  }
}

async function* readCsv(
  path: string,
  options: ReadOptions,
): AsyncGenerator<RawCell[]> {
  const sample = await readSample(path);
  const encoding = options.encoding ?? guessEncoding(sample);
  const decoder = new TextDecoder(encoding);
  const delimiter = options.delimiter ?? sniffDelimiter(decoder.decode(sample));
  const parser = new CsvParser(delimiter);
  let first = true;
  for await (const chunk of createReadStream(path)) {
    let text = decoder.decode(chunk as Buffer, { stream: true });
    if (first) text = text.replace(/^\uFEFF/, "");
    first = false;
    yield* parser.push(text);
  }
  yield* parser.push(decoder.decode());
  yield* parser.end();
}

function guessEncoding(sample: Buffer): "utf-8" | "windows-1252" {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: true });
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

// The streaming reader needs workbook.xml before the sheets inside the zip. Files that
// order it differently are read with the regular reader instead, which holds the whole
// sheet in memory; the file size limit keeps that bounded.
async function* readXlsx(path: string): AsyncGenerator<RawCell[]> {
  let yielded = false;
  try {
    for await (const row of streamXlsx(path)) {
      yielded = true;
      yield row;
    }
  } catch (error) {
    if (yielded) throw unreadableExcel(error);
    yield* loadXlsx(path);
  }
}

async function* streamXlsx(path: string): AsyncGenerator<RawCell[]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  for await (const sheet of reader) {
    for await (const row of sheet) yield rowValues(row.values);
    return;
  }
}

async function* loadXlsx(path: string): AsyncGenerator<RawCell[]> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.readFile(path);
  } catch (error) {
    throw unreadableExcel(error);
  }
  const rows: RawCell[][] = [];
  book.worksheets[0]?.eachRow({ includeEmpty: true }, (row) => {
    rows.push(rowValues(row.values));
  });
  yield* rows;
}

function unreadableExcel(_cause: unknown): UnreadableFileError {
  return new UnreadableFileError("The Excel file could not be read.");
}

function rowValues(
  values: ExcelJS.CellValue[] | { [k: string]: ExcelJS.CellValue },
): RawCell[] {
  const cells = Array.isArray(values) ? values.slice(1) : [];
  return cells.map(plainValue);
}

function plainValue(value: ExcelJS.CellValue | undefined): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || value instanceof Date) return value;
  if ("result" in value) return plainValue(value.result as ExcelJS.CellValue);
  if ("richText" in value) return value.richText.map((p) => p.text).join("");
  if ("text" in value) return String(value.text);
  return null;
}
