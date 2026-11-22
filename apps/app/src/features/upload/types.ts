// Shapes the server sends for an import. They mirror apps/api/src/imports.

import type {
  CleanShipment,
  ColumnMapping,
  IssueKind,
  RawCell,
  RowIssue,
  ShipmentField,
} from "@freight-desk/shared";

export type { ColumnMapping, IssueKind, ShipmentField };

export type FileInspection = {
  headerRow: number;
  headers: string[];
  mapping: ColumnMapping;
  uncertain: ShipmentField[];
  missingRequired: ShipmentField[];
  previewRows: RawCell[][];
};

export type OpenedImport = {
  sessionId: string;
  inspection: FileInspection;
  knownTemplate?: { name: string; version: number } | null;
  format?: "xlsx" | "csv";
};

export type DraftSummary = {
  draftId: string;
  originalName: string;
  savedAt: string;
};

export type SampleRow = { shipment: CleanShipment; issues: RowIssue[] };

export type ProcessSummaryView = {
  rowsRead: number;
  rowsClean: number;
  rowsWithIssues: number;
  issueCounts: Record<IssueKind, number>;
};

export type JobView<Result = ProcessSummaryView> = {
  id: string;
  state: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  attempts: number;
  error: string | null;
  result: Result | null;
};
