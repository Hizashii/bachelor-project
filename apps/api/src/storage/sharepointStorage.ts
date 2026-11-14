import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { StorageError } from "./errors.js";
import type { GraphDriveItem, GraphGateway } from "./graphClient.js";
import {
  type DownloadedFile,
  destinationKey,
  destinationPath,
  type FilePage,
  type ListFilesInput,
  type Principal,
  type StorageAdapter,
  type StorageDestination,
  type StoredFile,
  storageDestinationSchema,
  type UploadChunkResult,
  type UploadRequest,
  type UploadSessionStart,
} from "./types.js";

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;
const MAX_CHUNK_SIZE = 60 * 1024 * 1024;
const UPLOAD_SESSION_TTL = 60 * 60 * 1000;

export type SharePointMetadataFields = {
  organizationId: string;
  ownerId: string;
  fileId: string;
  destination: string;
  processingStatus: string;
  retentionHold: string;
  retentionUntil: string;
};

export type SharePointStorageConfig = {
  driveId: string;
  rootItemId: string;
  cursorSecret: string;
  chunkSizeBytes?: number;
  uploadSessionTtlMs?: number;
  metadataFields?: Partial<SharePointMetadataFields>;
};

type ResolvedFile = {
  item: GraphDriveItem;
  fields: Record<string, unknown>;
  destination: StorageDestination;
};

type UploadState = {
  principal: Principal;
  request: UploadRequest;
  uploadUrl: string;
  parentItemId: string;
  expiresAt: number;
  nextExpectedRanges: string[];
};

type CursorPayload = {
  driveId: string;
  parentItemId: string;
  destination: string;
  userId: string;
  organizationId: string;
  nextLink: string;
};

export class SharePointStorageAdapter implements StorageAdapter {
  private readonly fields: SharePointMetadataFields;
  private readonly chunkSize: number;
  private readonly uploadSessionTtlMs: number;
  private readonly uploads = new Map<string, UploadState>();

  constructor(
    private readonly graph: GraphGateway,
    private readonly config: SharePointStorageConfig,
  ) {
    this.chunkSize = boundedChunkSize(
      config.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE,
    );
    this.uploadSessionTtlMs = config.uploadSessionTtlMs ?? UPLOAD_SESSION_TTL;
    this.fields = {
      organizationId: "FreightOrganisationId",
      ownerId: "FreightOwnerId",
      fileId: "FreightFileId",
      destination: "FreightDestination",
      processingStatus: "FreightProcessingStatus",
      retentionHold: "FreightRetentionHold",
      retentionUntil: "FreightRetentionUntil",
      ...config.metadataFields,
    };
  }

  async ensureInitialFolders(): Promise<void> {
    const initialPaths = [
      ["inbound", "shipments"],
      ["inbound", "carrier-imports"],
      ["inbound", "invoices"],
      ["datasets", "shipments"],
      ["invoice-control"],
      ["exports"],
      ["audits"],
    ];
    for (const path of initialPaths) await this.ensureFolderPath(path);
  }

  async listFiles(
    principal: Principal,
    input: ListFilesInput,
  ): Promise<FilePage> {
    requirePermission(
      principal.permissions.readFiles,
      "You cannot view cloud files.",
    );
    requireDestinationAccess(principal, input.destination);
    const parentItemId = await this.resolveFolder(input.destination);
    const cursor = input.cursor
      ? decodeCursor(
          input.cursor,
          this.config.cursorSecret,
          principal,
          input.destination,
          this.config.driveId,
          parentItemId,
        )
      : null;
    const items: StoredFile[] = [];
    let nextLink = cursor?.nextLink ?? null;

    while (
      items.length < input.pageSize &&
      (nextLink !== null || items.length === 0)
    ) {
      const page = await this.graph.listChildren(
        this.config.driveId,
        parentItemId,
        nextLink,
        input.pageSize,
      );
      nextLink = page.nextLink;
      for (const item of page.value) {
        if (!item.file) continue;
        const resolved = await this.readFile(item, input.destination);
        if (!resolved || !canRead(resolved, principal, this.fields)) continue;
        items.push(await this.toStoredFileWithVersion(resolved));
        if (items.length === input.pageSize) break;
      }
      if (!nextLink) break;
    }

    return {
      items,
      nextCursor: nextLink
        ? encodeCursor(
            {
              driveId: this.config.driveId,
              parentItemId,
              destination: destinationKey(input.destination),
              userId: principal.userId,
              organizationId: principal.organizationId,
              nextLink,
            },
            this.config.cursorSecret,
          )
        : null,
    };
  }

  async getFileMetadata(
    principal: Principal,
    fileId: string,
  ): Promise<StoredFile> {
    const resolved = await this.resolveAuthorizedFile(
      principal,
      fileId,
      "read",
    );
    return this.toStoredFileWithVersion(resolved);
  }

  async initiateUpload(
    principal: Principal,
    input: UploadRequest,
  ): Promise<UploadSessionStart> {
    this.removeExpiredUploads();
    requirePermission(
      principal.permissions.uploadFiles,
      "You cannot upload cloud files.",
    );
    requireDestinationAccess(principal, input.destination);
    const parentItemId = await this.resolveFolder(input.destination);
    const existing = await this.findChild(parentItemId, input.fileName);
    if (existing) {
      throw new StorageError(
        "conflict",
        "A file with that name already exists.",
      );
    }
    const session = await this.graph.createUploadSession(
      this.config.driveId,
      parentItemId,
      input.fileName,
    );
    const uploadId = randomUUID();
    const expiresAt = Math.min(
      Date.parse(session.expirationDateTime),
      Date.now() + this.uploadSessionTtlMs,
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new StorageError(
        "cloud_unavailable",
        "Microsoft 365 returned an expired upload session.",
      );
    }
    this.uploads.set(uploadId, {
      principal,
      request: input,
      uploadUrl: session.uploadUrl,
      parentItemId,
      expiresAt,
      nextExpectedRanges: ["0-"],
    });
    return {
      uploadId,
      chunkSize: this.chunkSize,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async uploadChunk(
    principal: Principal,
    uploadId: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<UploadChunkResult> {
    requirePermission(
      principal.permissions.uploadFiles,
      "You cannot upload cloud files.",
    );
    const state = this.uploads.get(uploadId);
    if (!state)
      throw new StorageError(
        "not_found",
        "The upload session was not found or has expired.",
      );
    if (state.expiresAt <= Date.now()) {
      this.uploads.delete(uploadId);
      throw new StorageError(
        "not_found",
        "The upload session was not found or has expired.",
      );
    }
    ensureSamePrincipal(state.principal, principal);
    const range = parseContentRange(contentRange, state.request.size);
    if (
      range.length !== chunk.byteLength ||
      range.start !== expectedStart(state.nextExpectedRanges)
    ) {
      throw new StorageError(
        "invalid_request",
        "Upload chunks must be contiguous and match Content-Range.",
      );
    }
    if (chunk.byteLength > MAX_CHUNK_SIZE) {
      throw new StorageError("invalid_request", "Upload chunks are too large.");
    }

    const result = await this.graph.uploadChunk(
      state.uploadUrl,
      chunk,
      contentRange,
    );
    if (!result.item) {
      state.nextExpectedRanges = result.nextExpectedRanges ?? [
        `${range.end + 1}-`,
      ];
      return { completed: false, nextExpectedRanges: state.nextExpectedRanges };
    }

    try {
      await this.graph.patchItemFields(this.config.driveId, result.item.id, {
        [this.fields.organizationId]: principal.organizationId,
        [this.fields.ownerId]: principal.userId,
        [this.fields.fileId]: result.item.id,
        [this.fields.destination]: destinationKey(state.request.destination),
        [this.fields.processingStatus]: "pending",
      });
    } catch (error) {
      await this.deleteAfterFailedMetadataWrite(result.item.id);
      throw error;
    }
    this.uploads.delete(uploadId);
    const resolved = await this.resolveAuthorizedFile(
      principal,
      result.item.id,
      "read",
    );
    return {
      completed: true,
      file: await this.toStoredFileWithVersion(resolved),
    };
  }

  async downloadFile(
    principal: Principal,
    fileId: string,
  ): Promise<DownloadedFile> {
    const resolved = await this.resolveAuthorizedFile(
      principal,
      fileId,
      "read",
    );
    const response = await this.graph.downloadFile(this.config.driveId, fileId);
    if (!response.body)
      throw new StorageError(
        "cloud_unavailable",
        "The cloud file has no downloadable content.",
      );
    return {
      metadata: await this.toStoredFileWithVersion(resolved),
      body: readableFromWeb(response.body),
    };
  }

  async deleteFile(principal: Principal, fileId: string): Promise<void> {
    const resolved = await this.resolveAuthorizedFile(
      principal,
      fileId,
      "delete",
    );
    const metadata = toStoredFile(resolved, this.config.driveId, this.fields);
    if (metadata.retentionHold || isRetentionActive(metadata.retentionUntil)) {
      throw new StorageError(
        "retention_blocked",
        "Retention policy prevents deleting this file.",
      );
    }
    if (!principal.permissions.deleteFiles) {
      throw new StorageError("forbidden", "You cannot delete cloud files.");
    }
    if (
      metadata.ownerId !== principal.userId &&
      !principal.permissions.deleteOrganisationFiles
    ) {
      throw new StorageError(
        "forbidden",
        "You cannot delete another user's file.",
      );
    }
    await this.graph.deleteItem(this.config.driveId, fileId);
  }

  private async resolveAuthorizedFile(
    principal: Principal,
    fileId: string,
    action: "read" | "delete",
  ): Promise<ResolvedFile> {
    if (action === "read") {
      requirePermission(
        principal.permissions.readFiles,
        "You cannot view cloud files.",
      );
    }
    if (action === "delete") {
      requirePermission(
        principal.permissions.deleteFiles,
        "You cannot delete cloud files.",
      );
    }
    const item = await this.graph.getDriveItem(this.config.driveId, fileId);
    if (!item.file)
      throw new StorageError(
        "not_found",
        "The requested cloud file was not found.",
      );
    const fields = await this.graph.getItemFields(this.config.driveId, fileId);
    const destination = destinationFromMetadata(
      fields,
      this.fields.destination,
    );
    if (!destination)
      throw new StorageError(
        "not_found",
        "The requested cloud file was not found.",
      );
    const resolved = { item, fields, destination };
    if (!canRead(resolved, principal, this.fields)) {
      throw new StorageError(
        "forbidden",
        "You cannot access this organisation's cloud file.",
      );
    }
    requireDestinationAccess(principal, resolved.destination);
    if (action === "delete" && !principal.permissions.deleteOrganisationFiles) {
      const ownerId = fieldString(fields, this.fields.ownerId);
      if (ownerId !== principal.userId) {
        throw new StorageError(
          "forbidden",
          "You cannot delete another user's file.",
        );
      }
    }
    return resolved;
  }

  private async resolveFolder(
    destination: StorageDestination,
  ): Promise<string> {
    return this.ensureFolderPath(destinationPath(destination));
  }

  private async ensureFolderPath(path: string[]): Promise<string> {
    let parentItemId = this.config.rootItemId;
    for (const segment of path) {
      const existing = await this.findChild(parentItemId, segment);
      if (existing?.folder) {
        parentItemId = existing.id;
        continue;
      }
      try {
        const created = await this.graph.createFolder(
          this.config.driveId,
          parentItemId,
          segment,
        );
        parentItemId = created.id;
      } catch (error) {
        if (!(error instanceof StorageError) || error.code !== "conflict")
          throw error;
        const afterConflict = await this.findChild(parentItemId, segment);
        if (!afterConflict?.folder) throw error;
        parentItemId = afterConflict.id;
      }
    }
    return parentItemId;
  }

  private async findChild(
    parentItemId: string,
    name: string,
  ): Promise<GraphDriveItem | null> {
    let nextLink: string | null = null;
    do {
      const page = await this.graph.listChildren(
        this.config.driveId,
        parentItemId,
        nextLink,
        100,
      );
      const found = page.value.find((item) => item.name === name);
      if (found) return found;
      nextLink = page.nextLink;
    } while (nextLink);
    return null;
  }

  private async readFile(
    item: GraphDriveItem,
    destination: StorageDestination,
  ): Promise<ResolvedFile | null> {
    const fields = await this.graph.getItemFields(this.config.driveId, item.id);
    const storedDestination = destinationFromMetadata(
      fields,
      this.fields.destination,
    );
    if (
      !storedDestination ||
      destinationKey(storedDestination) !== destinationKey(destination)
    ) {
      return null;
    }
    return { item, fields, destination: storedDestination };
  }

  private async toStoredFileWithVersion(
    resolved: ResolvedFile,
  ): Promise<StoredFile> {
    const versions = await this.graph.listVersions(
      this.config.driveId,
      resolved.item.id,
    );
    const stored = toStoredFile(resolved, this.config.driveId, this.fields);
    return { ...stored, versionId: versions[0]?.id ?? stored.versionId };
  }

  private async deleteAfterFailedMetadataWrite(itemId: string): Promise<void> {
    try {
      await this.graph.deleteItem(this.config.driveId, itemId);
    } catch {
      // The original failure is more useful to the caller; the orphan is visible to an administrator for cleanup.
    }
  }

  private removeExpiredUploads(): void {
    const now = Date.now();
    for (const [uploadId, upload] of this.uploads) {
      if (upload.expiresAt <= now) this.uploads.delete(uploadId);
    }
  }
}

export class UnavailableStorageAdapter implements StorageAdapter {
  async ensureInitialFolders(): Promise<void> {}

  listFiles(): Promise<FilePage> {
    return Promise.reject(unavailable());
  }

  getFileMetadata(): Promise<StoredFile> {
    return Promise.reject(unavailable());
  }

  initiateUpload(): Promise<UploadSessionStart> {
    return Promise.reject(unavailable());
  }

  uploadChunk(): Promise<UploadChunkResult> {
    return Promise.reject(unavailable());
  }

  downloadFile(): Promise<DownloadedFile> {
    return Promise.reject(unavailable());
  }

  deleteFile(): Promise<void> {
    return Promise.reject(unavailable());
  }
}

function unavailable(): StorageError {
  return new StorageError(
    "cloud_unavailable",
    "Microsoft 365 cloud storage is not configured or unavailable.",
  );
}

function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) throw new StorageError("forbidden", message);
}

function requireDestinationAccess(
  principal: Principal,
  destination: StorageDestination,
): void {
  const key = destinationKey(destination);
  if (
    !principal.allowedDestinationKeys.includes("*") &&
    !principal.allowedDestinationKeys.includes(key)
  ) {
    throw new StorageError(
      "forbidden",
      "You cannot access this cloud storage folder.",
    );
  }
}

function ensureSamePrincipal(expected: Principal, actual: Principal): void {
  if (
    expected.userId !== actual.userId ||
    expected.organizationId !== actual.organizationId
  ) {
    throw new StorageError(
      "forbidden",
      "The upload session belongs to another user or organisation.",
    );
  }
}

function canRead(
  file: ResolvedFile,
  principal: Principal,
  fields: SharePointMetadataFields,
): boolean {
  const organizationId = fieldString(file.fields, fields.organizationId);
  const ownerId = fieldString(file.fields, fields.ownerId);
  return (
    organizationId === principal.organizationId &&
    (ownerId === principal.userId ||
      principal.permissions.readOrganisationFiles)
  );
}

function toStoredFile(
  file: ResolvedFile,
  driveId: string,
  fields: SharePointMetadataFields,
): StoredFile {
  const versionId =
    fieldString(file.fields, "_UIVersionString") || file.item.eTag || "unknown";
  return {
    id: file.item.id,
    driveId,
    name: file.item.name,
    contentType: file.item.file?.mimeType ?? "application/octet-stream",
    size: file.item.size ?? 0,
    ownerId: fieldString(file.fields, fields.ownerId),
    organizationId: fieldString(file.fields, fields.organizationId),
    destination: file.destination,
    uploadedAt: file.item.createdDateTime ?? new Date(0).toISOString(),
    modifiedAt: file.item.lastModifiedDateTime ?? new Date(0).toISOString(),
    processingStatus: processingStatus(file.fields, fields.processingStatus),
    versionId,
    eTag: file.item.eTag ?? null,
    retentionHold: fieldBoolean(file.fields, fields.retentionHold),
    retentionUntil: fieldDate(file.fields, fields.retentionUntil),
  };
}

function destinationFromMetadata(
  fields: Record<string, unknown>,
  destinationField: string,
): StorageDestination | null {
  const value = fieldString(fields, destinationField);
  if (!value) return null;
  const parts = value.split("/");
  if (parts.length === 2 && parts[0] === "inbound") {
    if (parts[1] === "shipments") return { kind: "inbound-shipments" };
    if (parts[1] === "carrier-imports")
      return { kind: "inbound-carrier-imports" };
    if (parts[1] === "invoices") return { kind: "inbound-invoices" };
  }
  if (value === "datasets/shipments") return { kind: "datasets-shipments" };
  if (parts.length === 3 && parts[0] === "carriers" && parts[2] === "tariffs") {
    const parsed = storageDestinationSchema.safeParse({
      kind: "carrier-tariffs",
      carrierId: parts[1],
    });
    return parsed.success ? parsed.data : null;
  }
  if (parts.length === 2 && parts[0] === "tenders") {
    const parsed = storageDestinationSchema.safeParse({
      kind: "tender",
      tenderId: parts[1],
    });
    return parsed.success ? parsed.data : null;
  }
  if (value === "invoice-control") return { kind: "invoice-control" };
  if (value === "exports") return { kind: "exports" };
  if (value === "audits") return { kind: "audits" };
  return null;
}

function fieldString(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  return typeof value === "string" ? value : "";
}

function fieldBoolean(fields: Record<string, unknown>, name: string): boolean {
  return fields[name] === true || fields[name] === "true";
}

function fieldDate(
  fields: Record<string, unknown>,
  name: string,
): string | null {
  const value = fieldString(fields, name);
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function processingStatus(
  fields: Record<string, unknown>,
  name: string,
): StoredFile["processingStatus"] {
  const value = fieldString(fields, name);
  return value === "processing" || value === "processed" || value === "failed"
    ? value
    : "pending";
}

function isRetentionActive(value: string | null): boolean {
  return value !== null && Date.parse(value) > Date.now();
}

function boundedChunkSize(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < 320 * 1024 ||
    value > MAX_CHUNK_SIZE
  ) {
    throw new Error(
      "SharePoint upload chunk size must be between 320 KiB and 60 MiB.",
    );
  }
  return value;
}

function parseContentRange(
  value: string,
  total: number,
): { start: number; end: number; length: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (!match)
    throw new StorageError("invalid_request", "Content-Range is invalid.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  const declaredTotal = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    declaredTotal !== total ||
    start < 0 ||
    end < start ||
    end >= total
  ) {
    throw new StorageError(
      "invalid_request",
      "Content-Range does not match the upload.",
    );
  }
  return { start, end, length: end - start + 1 };
}

function expectedStart(ranges: readonly string[]): number {
  const match = /^(\d+)-/.exec(ranges[0] ?? "");
  return match ? Number(match[1]) : 0;
}

function encodeCursor(payload: CursorPayload, secret: string): string {
  const value = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
  return `${value}.${signature}`;
}

function decodeCursor(
  cursor: string,
  secret: string,
  principal: Principal,
  destination: StorageDestination,
  driveId: string,
  parentItemId: string,
): CursorPayload {
  const [value, signature] = cursor.split(".");
  if (!value || !signature)
    throw new StorageError(
      "invalid_request",
      "The file list cursor is invalid.",
    );
  const expected = createHmac("sha256", secret).update(value).digest();
  const provided = Buffer.from(signature, "base64url");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new StorageError(
      "invalid_request",
      "The file list cursor is invalid.",
    );
  }
  let payload: CursorPayload;
  try {
    payload = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as CursorPayload;
  } catch {
    throw new StorageError(
      "invalid_request",
      "The file list cursor is invalid.",
    );
  }
  if (
    payload.driveId !== driveId ||
    payload.parentItemId !== parentItemId ||
    payload.destination !== destinationKey(destination) ||
    payload.userId !== principal.userId ||
    payload.organizationId !== principal.organizationId ||
    !payload.nextLink.startsWith("https://graph.microsoft.com/")
  ) {
    throw new StorageError(
      "invalid_request",
      "The file list cursor is invalid.",
    );
  }
  return payload;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function readableFromWeb(
  body: ReadableStream<Uint8Array>,
): NodeJS.ReadableStream {
  return Readable.from(
    (async function* () {
      const reader = body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) return;
          yield Buffer.from(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
    })(),
  );
}
