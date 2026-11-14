// A small streaming CSV parser: feed it text chunks, get complete rows back.
// Handles quoted fields, doubled quotes and line breaks inside quotes.
// Not for opening files: see readRows.ts.

import { importLimits } from "./limits.ts";

export const CSV_DELIMITERS = [";", ",", "\t"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export function sniffDelimiter(sample: string): CsvDelimiter {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts = CSV_DELIMITERS.map((mark) => firstLine.split(mark).length);
  return CSV_DELIMITERS[counts.indexOf(Math.max(...counts))] ?? ";";
}

export class CsvFieldTooLongError extends Error {}

export class CsvParser {
  private row: string[] = [];
  private field = "";
  private inQuotes = false;
  private quoteSeen = false;
  private skipLineFeed = false;

  private readonly delimiter: CsvDelimiter;

  constructor(delimiter: CsvDelimiter) {
    this.delimiter = delimiter;
  }

  push(text: string): string[][] {
    const rows: string[][] = [];
    for (const char of text) this.consume(char, rows);
    return rows;
  }

  end(): string[][] {
    const rows: string[][] = [];
    if (this.field !== "" || this.row.length > 0) this.finishRow(rows);
    return rows;
  }

  private consume(char: string, rows: string[][]): void {
    if (this.skipLineFeed && char === "\n") {
      this.skipLineFeed = false;
      return;
    }
    this.skipLineFeed = false;
    if (this.quoteSeen) {
      this.quoteSeen = false;
      if (char === '"') {
        this.field += '"';
        return;
      }
      this.inQuotes = false;
    }
    if (this.inQuotes) {
      if (char === '"') this.quoteSeen = true;
      else this.append(char);
      return;
    }
    this.consumeUnquoted(char, rows);
  }

  private consumeUnquoted(char: string, rows: string[][]): void {
    if (char === '"' && this.field === "") this.inQuotes = true;
    else if (char === this.delimiter) this.finishField();
    else if (char === "\n" || char === "\r") {
      this.skipLineFeed = char === "\r";
      this.finishRow(rows);
    } else this.append(char);
  }

  private append(char: string): void {
    if (this.field.length >= importLimits.maxCellLength) {
      throw new CsvFieldTooLongError();
    }
    this.field += char;
  }

  private finishField(): void {
    this.row.push(this.field);
    this.field = "";
  }

  private finishRow(rows: string[][]): void {
    this.finishField();
    rows.push(this.row);
    this.row = [];
  }
}
