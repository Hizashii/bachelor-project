// Cleans a whole uploaded file row by row and writes the result to a new file.
// Memory use stays flat: only the current row and the issue counters are kept.
// Not for storing results anywhere: the caller decides what happens to the output file.

import {
  type CleanShipment,
  type ColumnMapping,
  cellText,
  cleanRow,
  DuplicateTracker,
  type IssueKind,
  type RawCell,
  type RowIssue,
  SHIPMENT_FIELDS,
} from "@freight-desk/shared";
import {
  type HeaderSplit,
  missingRequiredFields,
  splitHeader,
} from "./inspect.ts";
import { type ReadOptions, readRows } from "./readRows.ts";
import {
  type OutputCell,
  type OutputFormat,
  openSink,
  type RowSink,
} from "./sinks.ts";

export type ProcessInput = {
  inputPath: string;
  outputPath: string;
  format: OutputFormat;
  read: ReadOptions;
  mapping: ColumnMapping;
  headerRow?: number;
  signal: AbortSignal;
  onProgress: (rowsRead: number) => void;
};

export type ProcessSummary = {
  rowsRead: number;
  rowsClean: number;
  rowsWithIssues: number;
  issueCounts: Record<IssueKind, number>;
  issues: RowIssue[];
  issuesTruncated: boolean;
};

export class MappingError extends Error {}
export class CancelledError extends Error {}

const MAX_REPORTED_ISSUES = 500;
const MINOR_UNITS_PER_MAJOR = 100;
const PROGRESS_EVERY_ROWS = 500;
const OUTPUT_HEADER = ["sourceRow", ...SHIPMENT_FIELDS];

export async function processShipments(
  input: ProcessInput,
): Promise<ProcessSummary> {
  const missing = missingRequiredFields(input.mapping);
  if (missing.length > 0) {
    throw new MappingError(
      `Required columns are not mapped: ${missing.join(", ")}`,
    );
  }
  const split = await splitHeader(
    readRows(input.inputPath, input.read),
    input.headerRow,
  );
  const summary = emptySummary();
  const sink = openSink(input.outputPath, input.format);
  try {
    await sink.write(OUTPUT_HEADER);
    await processRows(split, input, summary, sink);
  } finally {
    await sink.close();
  }
  input.onProgress(summary.rowsRead);
  return summary;
}

async function processRows(
  split: HeaderSplit,
  input: ProcessInput,
  summary: ProcessSummary,
  sink: RowSink,
): Promise<void> {
  const context = { mapping: input.mapping, headers: split.headers };
  const duplicates = new DuplicateTracker();
  let sourceRow = split.headerRow;
  for await (const cells of split.rows) {
    sourceRow += 1;
    if (input.signal.aborted) throw new CancelledError();
    if (isBlank(cells)) continue;
    const { shipment, issues } = cleanRow(cells, sourceRow, context);
    const duplicate = duplicates.check(shipment.reference, sourceRow);
    record(summary, duplicate ? [...issues, duplicate] : issues);
    await sink.write(outputCells(shipment));
    if (summary.rowsRead % PROGRESS_EVERY_ROWS === 0) {
      input.onProgress(summary.rowsRead);
    }
  }
}

function isBlank(cells: readonly RawCell[]): boolean {
  return cells.every((cell) => cellText(cell) === "");
}

function emptySummary(): ProcessSummary {
  return {
    rowsRead: 0,
    rowsClean: 0,
    rowsWithIssues: 0,
    issueCounts: { missing: 0, invalid: 0, duplicate: 0, inconsistent: 0 },
    issues: [],
    issuesTruncated: false,
  };
}

function record(summary: ProcessSummary, issues: RowIssue[]): void {
  summary.rowsRead += 1;
  if (issues.length === 0) {
    summary.rowsClean += 1;
    return;
  }
  summary.rowsWithIssues += 1;
  for (const issue of issues) {
    summary.issueCounts[issue.kind] += 1;
    if (summary.issues.length < MAX_REPORTED_ISSUES) summary.issues.push(issue);
    else summary.issuesTruncated = true;
  }
}

function outputCells(shipment: CleanShipment): OutputCell[] {
  return [
    shipment.sourceRow,
    ...SHIPMENT_FIELDS.map((field) => {
      const value = shipment[field];
      return field === "quotedCostMinor" && typeof value === "number"
        ? value / MINOR_UNITS_PER_MAJOR
        : value;
    }),
  ];
}
