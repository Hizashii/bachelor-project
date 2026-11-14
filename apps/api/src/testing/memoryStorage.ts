// An in-memory StorageAdapter for automated tests only; it is never wired into the server.
// It keeps the rules the tests rely on: folders are limited by the principal, files belong
// to one organisation, and a name that already exists in a folder is a conflict.

import { Readable } from "node:stream";
import { StorageError } from "../storage/errors.ts";
import {
  destinationKey,
  type Principal,
  type StorageAdapter,
  type StoredFile,
  type UploadRequest,
} from "../storage/types.ts";

type Entry = { file: StoredFile; body: Buffer };
type Upload = { principal: Principal; request: UploadRequest };

const CHUNK_SIZE = 1024 * 1024;

export function createMemoryStorage(): StorageAdapter & {
  entries: Map<string, Entry>;
} {
  const entries = new Map<string, Entry>();
  const uploads = new Map<string, Upload>();
  let counter = 0;

  const allow = (principal: Principal, key: string) => {
    const keys = principal.allowedDestinationKeys;
    if (!keys.includes("*") && !keys.includes(key)) {
      throw new StorageError("forbidden", "You cannot access this folder.");
    }
  };
  const visible = (principal: Principal, entry: Entry) =>
    entry.file.organizationId === principal.organizationId;
  const inFolder = (entry: Entry, key: string) =>
    destinationKey(entry.file.destination) === key;
  const find = (principal: Principal, fileId: string) => {
    const entry = entries.get(fileId);
    if (!entry || !visible(principal, entry)) {
      throw new StorageError("not_found", "The file was not found.");
    }
    return entry;
  };

  return {
    entries,
    async ensureInitialFolders() {},
    async listFiles(principal, input) {
      const key = destinationKey(input.destination);
      allow(principal, key);
      const items = [...entries.values()]
        .filter((entry) => visible(principal, entry) && inFolder(entry, key))
        .map((entry) => entry.file);
      return { items, nextCursor: null };
    },
    async getFileMetadata(principal, fileId) {
      return find(principal, fileId).file;
    },
    async initiateUpload(principal, input) {
      const key = destinationKey(input.destination);
      allow(principal, key);
      const clash = [...entries.values()].some(
        (entry) =>
          visible(principal, entry) &&
          inFolder(entry, key) &&
          entry.file.name === input.fileName,
      );
      if (clash) {
        throw new StorageError(
          "conflict",
          "A file with that name already exists.",
        );
      }
      const uploadId = crypto.randomUUID();
      uploads.set(uploadId, { principal, request: input });
      return {
        uploadId,
        chunkSize: CHUNK_SIZE,
        expiresAt: new Date().toISOString(),
      };
    },
    async uploadChunk(principal, uploadId, chunk) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.principal.userId !== principal.userId) {
        throw new StorageError("not_found", "The upload was not found.");
      }
      counter += 1;
      const now = new Date().toISOString();
      const file: StoredFile = {
        id: `file-${counter}`,
        driveId: "memory",
        name: upload.request.fileName,
        contentType: upload.request.contentType,
        size: chunk.byteLength,
        ownerId: principal.userId,
        organizationId: principal.organizationId,
        destination: upload.request.destination,
        uploadedAt: now,
        modifiedAt: now,
        processingStatus: "pending",
        versionId: "1",
        eTag: null,
        retentionHold: false,
        retentionUntil: null,
      };
      entries.set(file.id, { file, body: Buffer.from(chunk) });
      uploads.delete(uploadId);
      return { completed: true, file };
    },
    async downloadFile(principal, fileId) {
      const entry = find(principal, fileId);
      return { metadata: entry.file, body: Readable.from([entry.body]) };
    },
    async deleteFile(principal, fileId) {
      find(principal, fileId);
      entries.delete(fileId);
    },
  };
}
