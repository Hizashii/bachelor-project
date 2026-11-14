// The import use cases the screens call: open a file, preview, process, save or download.
// Sessions live in memory with their temporary files and expire with them.
// Not for HTTP: see routes.ts.

import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import {
  type CleanShipment,
  type ColumnMapping,
  cleanRow,
  type RowIssue,
} from "@freight-desk/shared";
import type { AccessContext, PermissionChecker } from "../contracts/access.ts";
import type { FileStore } from "../contracts/fileStore.ts";
import { JobRunner, type JobView } from "../jobs/jobRunner.ts";
import { type FileInspection, inspectFile, splitHeader } from "./inspect.ts";
import { importLimits } from "./limits.ts";
import {
  CancelledError,
  MappingError,
  type ProcessSummary,
  processShipments,
} from "./processShipments.ts";
import {
  detectFileKind,
  type FileKind,
  readRows,
  UnreadableFileError,
} from "./readRows.ts";
import { type ImportManifest, saveImportToCloud } from "./saveToCloud.ts";
import type { OutputFormat } from "./sinks.ts";
import {
  createDownloadToken,
  removeWorkspace,
  type Workspace,
} from "./tempFiles.ts";

export class ImportAccessError extends Error {}
export class ImportStateError extends Error {}

type Session = {
  id: string;
  organisationId: string;
  workspace: Workspace;
  originalName: string;
  inputPath: string;
  kind: FileKind;
  inspection: FileInspection;
  options?: { mapping: ColumnMapping; format: OutputFormat };
  outputPath: string | null;
  jobId: string | null;
};

type Dependencies = { store: FileStore; permissions: PermissionChecker };

const USER_MESSAGE_FALLBACK = "Processing failed. Please try again.";

export class ImportService {
  private readonly deps: Dependencies;
  private readonly sessions = new Map<string, Session>();
  private readonly jobs = new JobRunner<ProcessSummary>({
    maxConcurrent: importLimits.maxConcurrentJobs,
    maxAttempts: importLimits.maxAttempts,
    isCancellation: (error) => error instanceof CancelledError,
    describeError: (error) =>
      error instanceof UnreadableFileError || error instanceof MappingError
        ? error.message
        : USER_MESSAGE_FALLBACK,
  });

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  // Public so the draft library can apply the same rule to its own writes.
  allow(context: AccessContext, action: "import:upload" | "import:read") {
    const resource = { organisationId: context.organisationId };
    if (!this.deps.permissions.can(context, action, resource)) {
      throw new ImportAccessError("Access denied.");
    }
  }

  private session(context: AccessContext, id: string): Session {
    this.allow(context, "import:read");
    const found = this.sessions.get(id);
    if (!found || found.organisationId !== context.organisationId) {
      throw new ImportAccessError("Import not found.");
    }
    return found;
  }

  // Takes a file that is already in a temporary folder and reads its header and preview.
  async open(
    context: AccessContext,
    workspace: Workspace,
    fileName: string,
    receivedPath: string,
  ) {
    let kind: FileKind;
    let inputPath: string;
    let inspection: FileInspection;
    try {
      this.allow(context, "import:upload");
      kind = await detectFileKind(receivedPath);
      inputPath = join(workspace.dir, `original.${kind}`);
      await rename(receivedPath, inputPath);
      inspection = await inspectFile(inputPath, { kind });
    } catch (error) {
      await removeWorkspace(workspace);
      throw error;
    }
    const session: Session = {
      id: workspace.id,
      organisationId: context.organisationId,
      workspace,
      originalName: fileName,
      inputPath,
      kind,
      inspection,
      outputPath: null,
      jobId: null,
    };
    this.sessions.set(session.id, session);
    return { sessionId: session.id, inspection };
  }

  // What the library needs to know about an open session: where the file is and its columns.
  sourceOf(context: AccessContext, id: string) {
    const { inputPath, originalName, kind, inspection } = this.session(
      context,
      id,
    );
    return { inputPath, originalName, kind, headers: inspection.headers };
  }

  // A small sample cleaned with the chosen mapping, so mistakes show before the full run.
  async previewCleaning(
    context: AccessContext,
    id: string,
    mapping: ColumnMapping,
  ) {
    const session = this.session(context, id);
    const split = await splitHeader(
      readRows(session.inputPath, { kind: session.kind }),
      session.inspection.headerRow,
    );
    const rows: { shipment: CleanShipment; issues: RowIssue[] }[] = [];
    let sourceRow = split.headerRow;
    for await (const cells of split.rows) {
      sourceRow += 1;
      rows.push(
        cleanRow(cells, sourceRow, { mapping, headers: split.headers }),
      );
      if (rows.length >= importLimits.previewRows) break;
    }
    return rows;
  }

  start(
    context: AccessContext,
    id: string,
    mapping: ColumnMapping,
    format: OutputFormat,
  ) {
    const session = this.session(context, id);
    this.allow(context, "import:upload");
    const running = this.job(context, id);
    if (running?.state === "pending" || running?.state === "processing") {
      return running;
    }
    session.options = { mapping, format };
    const outputPath = join(
      session.workspace.dir,
      `processed-${randomUUID()}.${format}`,
    );
    const job = this.jobs.submit(context, session.id, (signal, report) =>
      processShipments({
        inputPath: session.inputPath,
        outputPath,
        format,
        read: { kind: session.kind },
        mapping,
        headerRow: session.inspection.headerRow,
        signal,
        onProgress: report,
      }),
    );
    session.jobId = job.id;
    session.outputPath = outputPath;
    return job;
  }

  job(context: AccessContext, id: string): JobView<ProcessSummary> | null {
    const session = this.session(context, id);
    return session.jobId ? this.jobs.get(context, session.jobId) : null;
  }

  cancel(context: AccessContext, id: string) {
    const session = this.session(context, id);
    return session.jobId ? this.jobs.cancel(context, session.jobId) : null;
  }

  retry(context: AccessContext, id: string) {
    const session = this.session(context, id);
    return session.jobId ? this.jobs.retry(context, session.jobId) : null;
  }

  private finished(context: AccessContext, id: string) {
    const session = this.session(context, id);
    const job = this.job(context, id);
    if (
      job?.state !== "completed" ||
      !job.result ||
      !session.outputPath ||
      !session.options
    ) {
      throw new ImportStateError("The file has not finished processing.");
    }
    return {
      session,
      summary: job.result,
      outputPath: session.outputPath,
      options: session.options,
    };
  }

  async saveToCloud(
    context: AccessContext,
    id: string,
  ): Promise<ImportManifest> {
    this.allow(context, "import:upload");
    const { session, summary, outputPath, options } = this.finished(
      context,
      id,
    );
    return saveImportToCloud({
      context,
      store: this.deps.store,
      originalPath: session.inputPath,
      originalName: session.originalName,
      processedPath: outputPath,
      format: options.format,
      mapping: options.mapping,
      headers: session.inspection.headers,
      summary,
    });
  }

  // Download-only: the file stays in the temporary folder and nothing is saved elsewhere.
  download(context: AccessContext, id: string): string {
    const { session, outputPath, options } = this.finished(context, id);
    const base = session.originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w. -]/g, "_");
    const name = `${base}-processed.${options.format}`;
    return createDownloadToken(context, outputPath, name);
  }

  async discard(context: AccessContext, id: string): Promise<void> {
    const session = this.session(context, id);
    this.allow(context, "import:upload");
    this.cancel(context, id);
    this.sessions.delete(id);
    await removeWorkspace(session.workspace);
  }
}
