// Saves one processed import to the client's cloud through the SharePoint storage:
// original file, processed file, column mapping, validation report and manifest.
// Not for download-only runs: those never call this and leave nothing in the cloud.

import { randomUUID } from "node:crypto";
import type { ColumnMapping } from "@freight-desk/shared";
import type { AccessContext } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import type { ProcessSummary } from "./processShipments.ts";
import type { OutputFormat } from "./sinks.ts";

export const PROCESSING_VERSION = "1";

// Uploaded files go to the shipment inbox; results and reports to the datasets folder.
const ORIGINALS = { kind: "inbound-shipments" } as const;
const RESULTS = { kind: "datasets-shipments" } as const;

export type SaveInput = {
  context: AccessContext;
  documents: Documents;
  originalPath: string;
  originalName: string;
  processedPath: string;
  format: OutputFormat;
  mapping: ColumnMapping;
  headers: string[];
  summary: ProcessSummary;
};

export type ImportManifest = {
  importId: string;
  processingVersion: string;
  savedAt: string;
  savedBy: string;
  files: {
    original: string;
    processed: string;
    mapping: string;
    report: string;
  };
  rows: Pick<ProcessSummary, "rowsRead" | "rowsClean" | "rowsWithIssues">;
  issueCounts: ProcessSummary["issueCounts"];
};

export class SaveFailedError extends Error {
  readonly savedPaths: string[];

  constructor(savedPaths: string[], cause: unknown) {
    super("Saving to Microsoft 365 failed.", { cause });
    this.savedPaths = savedPaths;
  }
}

// Only the two accepted upload types may appear in a stored path.
function extensionOf(name: string): string {
  const match = /\.(xlsx|csv)$/i.exec(name);
  return match ? `.${match[1]?.toLowerCase()}` : "";
}

// The manifest is written last, so an import without one is an unfinished save.
export async function saveImportToCloud(
  input: SaveInput,
): Promise<ImportManifest> {
  const { context, documents, summary } = input;
  const importId = randomUUID();
  const files = {
    original: `${importId}-original${extensionOf(input.originalName)}`,
    processed: `${importId}-processed.${input.format}`,
    mapping: `${importId}-mapping.json`,
    report: `${importId}-validation-report.json`,
  };
  const saved: string[] = [];
  const step = async (name: string, write: () => Promise<unknown>) => {
    await write();
    saved.push(name);
  };
  try {
    await step(files.original, () =>
      documents.putFile(context, ORIGINALS, files.original, input.originalPath),
    );
    await step(files.processed, () =>
      documents.putFile(context, RESULTS, files.processed, input.processedPath),
    );
    await step(files.mapping, () =>
      documents.putJson(context, RESULTS, files.mapping, {
        headers: input.headers,
        mapping: input.mapping,
      }),
    );
    await step(files.report, () =>
      documents.putJson(context, RESULTS, files.report, summary),
    );
    const manifest = buildManifest(importId, context, files, summary);
    await documents.putJson(
      context,
      RESULTS,
      `${importId}-manifest.json`,
      manifest,
    );
    return manifest;
  } catch (error) {
    throw new SaveFailedError(saved, error);
  }
}

function buildManifest(
  importId: string,
  context: AccessContext,
  files: ImportManifest["files"],
  summary: ProcessSummary,
): ImportManifest {
  return {
    importId,
    processingVersion: PROCESSING_VERSION,
    savedAt: new Date().toISOString(),
    savedBy: context.userId,
    files,
    rows: {
      rowsRead: summary.rowsRead,
      rowsClean: summary.rowsClean,
      rowsWithIssues: summary.rowsWithIssues,
    },
    issueCounts: summary.issueCounts,
  };
}
