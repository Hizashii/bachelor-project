// This file checks the template marker and header row, and reads one row into named cells.
// It does not interpret cell values; parseRow.ts does that.

import { normalizeKey } from "./normalize.ts";
import {
  HEADER_ROW_NUMBER,
  IMPORT_COLUMNS,
  type ImportColumnKey,
  TEMPLATE_MARKER,
  templateMarkerText,
} from "./template.ts";

export type ImportIssue = { row: number; message: string };
export type ColumnIndex = Partial<Record<ImportColumnKey, number>>;
export type Cells = Record<ImportColumnKey, string>;

export function readMarker(
  row: string[],
  expectedVersion: string,
): ImportIssue[] {
  const [label = "", value = ""] = row.map((cell) => cell.trim());
  if (label.toLowerCase() !== TEMPLATE_MARKER) {
    return [
      {
        row: 1,
        message:
          "This is not the approved rate template. Download the template and fill it in.",
      },
    ];
  }
  const expected = templateMarkerText(expectedVersion).toLowerCase();
  if (value.toLowerCase() === expected) return [];
  return [
    {
      row: 1,
      message: `Wrong template version. This tender needs version ${expectedVersion}.`,
    },
  ];
}

export function mapColumns(header: string[]): {
  index: ColumnIndex;
  issues: ImportIssue[];
} {
  const index: ColumnIndex = {};
  const issues: ImportIssue[] = [];
  const keys = header.map(normalizeKey);
  for (const column of IMPORT_COLUMNS) {
    const accepted = [normalizeKey(column.header), ...column.aliases];
    const found = keys.findIndex((key) => accepted.includes(key));
    if (found >= 0) index[column.key] = found;
    else if (column.required) {
      issues.push({
        row: HEADER_ROW_NUMBER,
        message: `Column "${column.header}" is missing.`,
      });
    }
  }
  return { index, issues };
}

export function readCells(row: string[], index: ColumnIndex): Cells {
  const cells = {} as Cells;
  for (const column of IMPORT_COLUMNS) {
    const position = index[column.key];
    cells[column.key] =
      position === undefined ? "" : (row[position] ?? "").trim();
  }
  return cells;
}
