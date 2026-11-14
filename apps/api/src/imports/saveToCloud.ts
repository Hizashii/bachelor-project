// Saves one processed import to the client's cloud through the FileStore contract:
// original file, processed file, column mapping, validation report and manifest.
// Not for download-only runs: those never call this and leave nothing in the cloud.

import { randomUUID } from "node:crypto";
import type { ColumnMapping } from "@freight-desk/shared";
import type { AccessContext } from "../contracts/access.ts";
import type { FileStore } from "../contracts/fileStore.ts";
import type { ProcessSummary } from "./processShipments.ts";
import type { OutputFormat } from "./sinks.ts";

export const PROCESSING_VERSION = "1";

export type SaveInput = {
  context: AccessContext;
  store: FileStore;
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

// The manifest is written last, so a folder without one is an unfinished save.
export async function saveImportToCloud(
  input: SaveInput,
): Promise<ImportManifest> {
  const { context, store, summary } = input;
  const importId = randomUUID();
  const folder = `imports/${importId}`;
  const files = {
    original: `${folder}/original${extensionOf(input.originalName)}`,
    processed: `${folder}/processed.${input.format}`,
    mapping: `${folder}/mapping.json`,
    report: `${folder}/validation-report.json`,
  };
  const saved: string[] = [];
  const step = async (path: string, write: () => Promise<unknown>) => {
    await write();
    saved.push(path);
  };
  try {
    await step(files.original, () =>
      store.putFile(context, files.original, input.originalPath),
    );
    await step(files.processed, () =>
      store.putFile(context, files.processed, input.processedPath),
    );
    await step(files.mapping, () =>
      store.putJson(context, files.mapping, {
        headers: input.headers,
        mapping: input.mapping,
      }),
    );
    await step(files.report, () =>
      store.putJson(context, files.report, summary),
    );
    const manifest = buildManifest(importId, context, files, summary);
    await store.putJson(context, `${folder}/manifest.json`, manifest);
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
