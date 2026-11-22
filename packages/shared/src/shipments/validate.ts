// Applies a column mapping to one spreadsheet row: cleans each value and reports problems.
// Duplicate references are detected across rows by the DuplicateTracker.
// Not for reading files or writing results: see apps/api/src/imports/.

import {
  cellText,
  normalisePostcode,
  parseDateTime,
  parseDecimal,
  parseMinorUnits,
  type RawCell,
  weightFactorFromHeader,
} from "./clean.ts";
import {
  type CleanShipment,
  DATE_FIELDS,
  NUMBER_FIELDS,
  REQUIRED_FIELDS,
  type ShipmentField,
} from "./fields.ts";
import type { ColumnMapping } from "./headers.ts";

export type IssueKind = "missing" | "invalid" | "duplicate" | "inconsistent";

export type RowIssue = {
  row: number;
  field: ShipmentField | null;
  kind: IssueKind;
};

export type CleanedRow = { shipment: CleanShipment; issues: RowIssue[] };

export type RowContext = {
  mapping: ColumnMapping;
  headers: readonly string[];
};

type Reader = (field: ShipmentField) => RawCell;
type Flag = (field: ShipmentField, kind: IssueKind) => void;

export function cleanRow(
  cells: readonly RawCell[],
  sourceRow: number,
  context: RowContext,
): CleanedRow {
  const issues: RowIssue[] = [];
  const read: Reader = (field) => {
    const index = context.mapping[field];
    return index === undefined ? undefined : cells[index];
  };
  const flag: Flag = (field, kind) =>
    issues.push({ row: sourceRow, field, kind });
  const text = (field: ShipmentField) => cellText(read(field)) || null;

  const shipment = {
    sourceRow,
    reference: text("reference"),
    carrier: text("carrier"),
    originPostcode: postcode("originPostcode", read, flag),
    destinationPostcode: postcode("destinationPostcode", read, flag),
    ...Object.fromEntries(
      NUMBER_FIELDS.map((field) => [field, number(field, read, context, flag)]),
    ),
    ...Object.fromEntries(
      DATE_FIELDS.map((field) => [field, date(field, read, flag)]),
    ),
    quotedCostMinor: cost(read, flag),
    invoiceReference: text("invoiceReference"),
    trackingReference: text("trackingReference"),
  } as CleanShipment;

  checkRequired(shipment, sourceRow, issues);
  checkConsistency(shipment, flag);
  return { shipment, issues };
}

function postcode(field: ShipmentField, read: Reader, flag: Flag) {
  const raw = read(field);
  const clean = normalisePostcode(raw);
  if (cellText(raw) !== "" && clean === null) flag(field, "invalid");
  return clean;
}

function number(
  field: ShipmentField,
  read: Reader,
  context: RowContext,
  flag: Flag,
): number | null {
  const raw = read(field);
  if (cellText(raw) === "") return null;
  const value = parseDecimal(raw);
  if (value === null || value < 0) {
    flag(field, "invalid");
    return null;
  }
  if (field !== "weightKg") return value;
  const index = context.mapping[field];
  const header = index === undefined ? "" : (context.headers[index] ?? "");
  return value * weightFactorFromHeader(header);
}

function date(field: ShipmentField, read: Reader, flag: Flag): string | null {
  const raw = read(field);
  if (cellText(raw) === "") return null;
  const value = parseDateTime(raw);
  if (value === null) flag(field, "invalid");
  return value;
}

function cost(read: Reader, flag: Flag): number | null {
  const raw = read("quotedCostMinor");
  if (cellText(raw) === "") return null;
  const value = parseMinorUnits(raw);
  if (value === null) flag("quotedCostMinor", "invalid");
  return value;
}

function checkRequired(
  shipment: CleanShipment,
  row: number,
  issues: RowIssue[],
): void {
  for (const field of REQUIRED_FIELDS) {
    const alreadyReported = issues.some((issue) => issue.field === field);
    if (shipment[field] === null && !alreadyReported) {
      issues.push({ row, field, kind: "missing" });
    }
  }
}

function checkConsistency(shipment: CleanShipment, flag: Flag): void {
  const { collectionAt, deliveryAt } = shipment;
  if (collectionAt && deliveryAt && deliveryAt < collectionAt) {
    flag("deliveryAt", "inconsistent");
  }
}

// Remembers references already seen so a second use is reported as a duplicate.
export class DuplicateTracker {
  private readonly seen = new Set<string>();

  check(reference: string | null, row: number): RowIssue | null {
    if (reference === null) return null;
    const key = reference.toLowerCase();
    if (!this.seen.has(key)) {
      this.seen.add(key);
      return null;
    }
    return { row, field: "reference", kind: "duplicate" };
  }
}
