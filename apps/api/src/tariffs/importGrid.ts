// Reads an uploaded carrier rate sheet into a draft grid for the carrier to confirm.
// Only the first sheet is read, and only a few thousand rows: a tariff is a small table.
// Not for saving anything: the carrier reviews the result and saves it as a draft.

import {
  importRateMatrix,
  type MatrixImport,
  type RawCell,
} from "@freight-desk/shared";
import {
  detectFileKind,
  readRows,
  UnreadableFileError,
} from "../imports/readRows.ts";

const MAX_TARIFF_ROWS = 2000;

export async function readTariffGrid(path: string): Promise<MatrixImport> {
  const kind = await detectFileKind(path);
  const rows: RawCell[][] = [];
  for await (const row of readRows(path, { kind })) {
    rows.push(row);
    if (rows.length > MAX_TARIFF_ROWS) {
      throw new UnreadableFileError("The rate sheet has too many rows.");
    }
  }
  return importRateMatrix(rows);
}
