import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type Dirent } from "node:fs";
import {
  access,
  appendFile,
  link as createHardLink,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { StorageError } from "./errors.ts";
import {
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
  uploadRequestSchema,
} from "./types.ts";

const CHUNK_SIZE = 1024 * 1024;
const SESSION_MINUTES = 30;
const META_DIRECTORY = ".freight-meta";
const TEMP_DIRECTORY = ".freight-upload";
const BASE_DESTINATIONS: StorageDestination[] = [
  { kind: "inbound-shipments" },
  { kind: "inbound-carrier-imports" },
  { kind: "inbound-invoices" },
  { kind: "datasets-shipments" },
  { kind: "import-drafts" },
  { kind: "import-mappings" },
  { kind: "tenders" },
  { kind: "invoice-control" },
  { kind: "exports" },
  { kind: "audits" },
];

const metadataSchema = z.object({
  id: z.string().uuid(),
  driveId: z.literal("local"),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  size: z.number().int().positive(),
  ownerId: z.string().min(1),
  organizationId: z.string().min(1),
  destination: storageDestinationSchema,
  uploadedAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  processingStatus: z.enum(["pending", "processing", "processed", "failed"]),
  versionId: z.string().min(1),
  eTag: z.string().nullable(),
  retentionHold: z.boolean(),
  retentionUntil: z.string().datetime().nullable(),
});

type UploadState = {
  principal: Principal;
  request: UploadRequest;
  tempPath: string;
  nextOffset: number;
  expiresAt: number;
  lock: Promise<void>;
};

type LocalEntry = { file: StoredFile; contentPath: string; metaPath: string };

export class LocalStorageAdapter implements StorageAdapter {
  private readonly uploads = new Map<string, UploadState>();
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async ensureInitialFolders(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const temporary = join(this.root, TEMP_DIRECTORY);
    await mkdir(temporary, { recursive: true });
    await removeExpiredTempFiles(temporary);
    for (const destination of BASE_DESTINATIONS) {
      await this.destinationDirectory(destination);
    }
  }

  async listFiles(
    principal: Principal,
    input: ListFilesInput,
  ): Promise<FilePage> {
    const key = destinationKey(input.destination);
    this.allow(principal, key);
    const directory = await this.destinationDirectory(input.destination);
    const entries = await this.readDirectoryEntries(
      directory,
      input.destination,
      principal,
    );
    const start = decodeCursor(input.cursor, key);
    const items = entries
      .slice(start, start + input.pageSize)
      .map((entry) => entry.file);
    const nextCursor =
      start + items.length < entries.length
        ? encodeCursor(start + items.length, key)
        : null;
    return { items, nextCursor };
  }

  async getFileMetadata(
    principal: Principal,
    fileId: string,
  ): Promise<StoredFile> {
    const entry = await this.authorizedEntry(principal, fileId);
    return entry.file;
  }

  async initiateUpload(
    principal: Principal,
    input: UploadRequest,
  ): Promise<UploadSessionStart> {
    const request = this.validateRequest(input);
    const key = destinationKey(request.destination);
    this.allow(principal, key);
    await this.destinationDirectory(request.destination);
    await this.ensureAvailableName(request);
    const uploadId = randomUUID();
    const tempPath = safeJoin(this.root, TEMP_DIRECTORY, `${uploadId}.part`);
    await writeFile(tempPath, Buffer.alloc(0), { flag: "wx" });
    this.uploads.set(uploadId, {
      principal,
      request,
      tempPath,
      nextOffset: 0,
      expiresAt: Date.now() + SESSION_MINUTES * 60_000,
      lock: Promise.resolve(),
    });
    return {
      uploadId,
      chunkSize: CHUNK_SIZE,
      expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
    };
  }

  async uploadChunk(
    principal: Principal,
    uploadId: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<UploadChunkResult> {
    const upload = this.uploads.get(uploadId);
    if (!upload || !samePrincipal(upload.principal, principal)) {
      throw new StorageError("not_found", "The upload was not found.");
    }
    return this.withUploadLock(upload, async () => {
      if (this.uploads.get(uploadId) !== upload) {
        throw new StorageError("not_found", "The upload was not found.");
      }
      return this.writeChunk(principal, uploadId, upload, chunk, contentRange);
    });
  }

  private async writeChunk(
    principal: Principal,
    uploadId: string,
    upload: UploadState,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<UploadChunkResult> {
    if (upload.expiresAt <= Date.now()) {
      await this.discardUpload(uploadId, upload);
      throw new StorageError("not_found", "The upload has expired.");
    }
    const range = parseContentRange(contentRange, upload.request.size);
    if (
      range.start !== upload.nextOffset ||
      range.length !== chunk.byteLength
    ) {
      throw new StorageError(
        "invalid_request",
        "Upload chunks must be contiguous.",
      );
    }
    await appendFile(upload.tempPath, chunk);
    upload.nextOffset = range.end + 1;
    if (upload.nextOffset !== upload.request.size) {
      return {
        completed: false,
        nextExpectedRanges: [`${upload.nextOffset}-`],
      };
    }
    try {
      const file = await this.finalizeUpload(principal, upload);
      this.uploads.delete(uploadId);
      return { completed: true, file };
    } catch (error) {
      await this.discardUpload(uploadId, upload);
      throw error;
    }
  }

  private async withUploadLock<T>(
    upload: UploadState,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = upload.lock;
    let release!: () => void;
    upload.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  async downloadFile(principal: Principal, fileId: string) {
    const entry = await this.authorizedEntry(principal, fileId);
    return { metadata: entry.file, body: createReadStream(entry.contentPath) };
  }

  async deleteFile(principal: Principal, fileId: string): Promise<void> {
    const entry = await this.authorizedEntry(principal, fileId);
    if (!principal.permissions.deleteFiles) {
      throw new StorageError("forbidden", "You cannot delete local files.");
    }
    if (
      entry.file.ownerId !== principal.userId &&
      !principal.permissions.deleteOrganisationFiles
    ) {
      throw new StorageError(
        "forbidden",
        "You cannot delete another user's file.",
      );
    }
    if (
      entry.file.retentionHold ||
      isRetentionActive(entry.file.retentionUntil)
    ) {
      throw new StorageError(
        "retention_blocked",
        "Retention policy prevents deleting this file.",
      );
    }
    await rm(entry.contentPath, { force: true });
    await rm(entry.metaPath, { force: true });
  }

  private async finalizeUpload(
    principal: Principal,
    upload: UploadState,
  ): Promise<StoredFile> {
    await this.ensureAvailableName(upload.request, false);
    const directory = await this.destinationDirectory(
      upload.request.destination,
    );
    const contentPath = safeJoin(directory, upload.request.fileName);
    const id = randomUUID();
    const now = new Date().toISOString();
    const file: StoredFile = {
      id,
      driveId: "local",
      name: upload.request.fileName,
      contentType: upload.request.contentType,
      size: upload.request.size,
      ownerId: principal.userId,
      organizationId: principal.organizationId,
      destination: upload.request.destination,
      uploadedAt: now,
      modifiedAt: now,
      processingStatus: "pending",
      versionId: "1",
      eTag: id,
      retentionHold: false,
      retentionUntil: null,
    };
    const metaPath = safeJoin(directory, META_DIRECTORY, `${id}.json`);
    let contentCreated = false;
    try {
      await copyAtomic(upload.tempPath, contentPath);
      contentCreated = true;
      await atomicJsonWrite(metaPath, file);
      await rm(upload.tempPath, { force: true });
      return file;
    } catch (error) {
      if (contentCreated) await rm(contentPath, { force: true });
      if (isExists(error)) {
        throw new StorageError(
          "conflict",
          "A file with that name already exists.",
          { cause: error },
        );
      }
      throw new StorageError(
        "cloud_unavailable",
        "Local storage could not save the file.",
        { cause: error },
      );
    }
  }

  private async authorizedEntry(
    principal: Principal,
    fileId: string,
  ): Promise<LocalEntry> {
    const entry = await this.findEntry(fileId);
    if (!entry || !canRead(entry.file, principal)) {
      throw new StorageError("not_found", "The file was not found.");
    }
    this.allow(principal, destinationKey(entry.file.destination));
    return entry;
  }

  private async findEntry(fileId: string): Promise<LocalEntry | null> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
    const paths = await metadataPaths(this.root);
    for (const metaPath of paths) {
      const entry = await this.readEntry(metaPath);
      if (entry?.file.id === fileId) return entry;
    }
    return null;
  }

  private async readDirectoryEntries(
    directory: string,
    destination: StorageDestination,
    principal: Principal,
  ): Promise<LocalEntry[]> {
    const metaDirectory = join(directory, META_DIRECTORY);
    let names: string[];
    try {
      names = await readdir(metaDirectory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw localReadError(error);
    }
    const entries = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => this.readEntry(join(metaDirectory, name))),
    );
    return entries
      .filter(
        (entry): entry is LocalEntry =>
          entry !== null &&
          canRead(entry.file, principal) &&
          destinationKey(entry.file.destination) ===
            destinationKey(destination),
      )
      .sort((left, right) =>
        right.file.uploadedAt.localeCompare(left.file.uploadedAt),
      );
  }

  private async readEntry(metaPath: string): Promise<LocalEntry | null> {
    try {
      const file = metadataSchema.parse(
        JSON.parse(await readFile(metaPath, "utf8")),
      );
      const directory = dirname(dirname(metaPath));
      const contentPath = safeJoin(directory, file.name);
      await access(contentPath);
      return { file, contentPath, metaPath };
    } catch (error) {
      if (isMissing(error)) return null;
      throw localReadError(error);
    }
  }

  private async destinationDirectory(
    destination: StorageDestination,
  ): Promise<string> {
    const directory = safeJoin(this.root, ...destinationPath(destination));
    await mkdir(join(directory, META_DIRECTORY), { recursive: true });
    return directory;
  }

  private async ensureAvailableName(input: UploadRequest, checkPending = true) {
    if (input.fileName === META_DIRECTORY) {
      throw new StorageError("invalid_request", "That file name is reserved.");
    }
    const directory = safeJoin(
      this.root,
      ...destinationPath(input.destination),
    );
    const target = safeJoin(directory, input.fileName);
    if (checkPending && this.hasPendingUpload(input)) {
      throw new StorageError(
        "conflict",
        "A file with that name is being uploaded.",
      );
    }
    try {
      await access(target);
      throw new StorageError(
        "conflict",
        "A file with that name already exists.",
      );
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if (!isMissing(error)) throw localReadError(error);
    }
  }

  private hasPendingUpload(input: UploadRequest): boolean {
    return [...this.uploads.values()].some(
      (upload) =>
        destinationKey(upload.request.destination) ===
          destinationKey(input.destination) &&
        upload.request.fileName === input.fileName,
    );
  }

  private validateRequest(input: UploadRequest): UploadRequest {
    const parsed = uploadRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new StorageError(
        "invalid_request",
        "The upload request is invalid.",
      );
    }
    return parsed.data;
  }

  private allow(principal: Principal, key: string): void {
    if (
      !principal.allowedDestinationKeys.includes("*") &&
      !principal.allowedDestinationKeys.includes(key)
    ) {
      throw new StorageError(
        "forbidden",
        "You cannot access this local storage folder.",
      );
    }
  }

  private async discardUpload(
    uploadId: string,
    upload: UploadState,
  ): Promise<void> {
    this.uploads.delete(uploadId);
    await rm(upload.tempPath, { force: true });
  }
}

export function resolveLocalStorageRoot(directory: string): string {
  const root = resolve(process.cwd(), directory);
  const publicRoots = [
    resolve(process.cwd(), "public"),
    resolve(process.cwd(), "apps/app/public"),
    resolve(process.cwd(), "apps/site/public"),
    resolve(process.cwd(), "apps/app/dist"),
    resolve(process.cwd(), "apps/site/dist"),
  ];
  if (publicRoots.some((publicRoot) => isWithin(publicRoot, root))) {
    throw new Error("LOCAL_STORAGE_DIR must be outside publicly served files.");
  }
  return root;
}

async function metadataPaths(root: string): Promise<string[]> {
  const result: string[] = [];
  await walk(root, result);
  return result;
}

async function walk(directory: string, result: string[]): Promise<void> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if (isMissing(error)) return;
    throw localReadError(error);
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name === META_DIRECTORY) {
      const files = await readdir(path);
      result.push(
        ...files
          .filter((name) => name.endsWith(".json"))
          .map((name) => join(path, name)),
      );
    } else if (entry.isDirectory() && entry.name !== TEMP_DIRECTORY) {
      await walk(path, result);
    }
  }
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function copyAtomic(source: string, target: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await pipeline(
      createReadStream(source),
      createWriteStream(temporary, { flags: "wx" }),
    );
    await createHardLink(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...parts);
  if (!isWithin(resolvedRoot, target))
    throw new StorageError("invalid_request", "The storage path is invalid.");
  return target;
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function encodeCursor(offset: number, key: string): string {
  return Buffer.from(JSON.stringify({ offset, key }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string | undefined, key: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: number; key?: string };
    const offset = parsed.offset;
    if (
      parsed.key !== key ||
      typeof offset !== "number" ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      throw new Error();
    return offset;
  } catch {
    throw new StorageError("invalid_request", "The storage cursor is invalid.");
  }
}

function parseContentRange(value: string, total: number) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (!match)
    throw new StorageError("invalid_request", "Content-Range is invalid.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (Number(match[3]) !== total || start < 0 || end < start || end >= total) {
    throw new StorageError(
      "invalid_request",
      "Content-Range does not match the upload.",
    );
  }
  return { start, end, length: end - start + 1 };
}

function samePrincipal(left: Principal, right: Principal): boolean {
  return (
    left.userId === right.userId && left.organizationId === right.organizationId
  );
}

function isRetentionActive(value: string | null): boolean {
  return value !== null && Date.parse(value) > Date.now();
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function canRead(file: StoredFile, principal: Principal): boolean {
  return (
    file.organizationId === principal.organizationId &&
    (file.ownerId === principal.userId ||
      principal.permissions.readOrganisationFiles)
  );
}

async function removeExpiredTempFiles(directory: string): Promise<void> {
  const cutoff = Date.now() - SESSION_MINUTES * 60_000;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".part")) continue;
    const path = join(directory, entry.name);
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true });
  }
}

function isExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function localReadError(cause: unknown): StorageError {
  return new StorageError(
    "cloud_unavailable",
    "Local storage could not be read.",
    { cause },
  );
}
