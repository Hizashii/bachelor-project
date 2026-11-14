// Looks at the top of an uploaded file: finds the header row, suggests a column mapping
// and returns a small page of rows for the preview screen.
// Not for processing the whole file: see processShipments.ts.

import {
  type ColumnMapping,
  cellText,
  parseDecimal,
  type RawCell,
  REQUIRED_FIELDS,
  type ShipmentField,
  suggestMapping,
} from "@freight-desk/shared";
import { importLimits } from "./limits.ts";
import { type ReadOptions, readRows } from "./readRows.ts";

export type HeaderSplit = {
  headerRow: number;
  headers: string[];
  rows: AsyncGenerator<RawCell[]>;
};

export type FileInspection = {
  headerRow: number;
  headers: string[];
  mapping: ColumnMapping;
  uncertain: ShipmentField[];
  missingRequired: ShipmentField[];
  previewRows: RawCell[][];
};

// A header row has at least two filled cells and none of them is a plain number.
function looksLikeHeader(row: RawCell[]): boolean {
  const filled = row.filter((cell) => cellText(cell) !== "");
  return (
    filled.length >= 2 && filled.every((cell) => parseDecimal(cell) === null)
  );
}

export async function splitHeader(
  rows: AsyncGenerator<RawCell[]>,
  headerRow?: number,
): Promise<HeaderSplit> {
  const buffer: RawCell[][] = [];
  let found = headerRow ? headerRow - 1 : -1;
  while (
    buffer.length < Math.max(importLimits.headerSearchRows, headerRow ?? 0)
  ) {
    const next = await rows.next();
    if (next.done) break;
    buffer.push(next.value);
    if (found < 0 && looksLikeHeader(next.value)) found = buffer.length - 1;
  }
  const index = Math.max(found, 0);
  const headers = (buffer[index] ?? []).map(cellText);
  return {
    headerRow: index + 1,
    headers,
    rows: remaining(buffer, index, rows),
  };
}

async function* remaining(
  buffer: RawCell[][],
  headerIndex: number,
  rows: AsyncGenerator<RawCell[]>,
): AsyncGenerator<RawCell[]> {
  yield* buffer.slice(headerIndex + 1);
  yield* rows;
}

export function missingRequiredFields(mapping: ColumnMapping): ShipmentField[] {
  return REQUIRED_FIELDS.filter((field) => mapping[field] === undefined);
}

export async function inspectFile(
  path: string,
  options: ReadOptions,
  headerRow?: number,
): Promise<FileInspection> {
  const split = await splitHeader(readRows(path, options), headerRow);
  const { mapping, uncertain } = suggestMapping(split.headers);
  const previewRows: RawCell[][] = [];
  for await (const row of split.rows) {
    previewRows.push(row);
    if (previewRows.length >= importLimits.previewRows) break;
  }
  return {
    headerRow: split.headerRow,
    headers: split.headers,
    mapping,
    uncertain,
    missingRequired: missingRequiredFields(mapping),
    previewRows,
  };
}
