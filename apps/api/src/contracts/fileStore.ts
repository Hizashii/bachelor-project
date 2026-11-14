// The only way processing and tariff code saves or loads durable files.
// The SharePoint storage layer implements it and applies the ETag check on overwrite.
// Paths are logical (for example "imports/<id>/original.xlsx"); the store decides where
// they live in the client's cloud. Freight data is never kept in PostgreSQL.

import type { AccessContext } from "./access.ts";

export type StoredFile = {
  path: string;
  etag: string;
  sizeBytes: number;
};

export class StorageConflictError extends Error {}
export class StorageUnavailableError extends Error {}

export interface FileStore {
  // Uploads a local file. When ifMatch is given the write fails with
  // StorageConflictError if the stored file changed since that ETag.
  putFile(
    context: AccessContext,
    path: string,
    localPath: string,
    ifMatch?: string,
  ): Promise<StoredFile>;
  putJson(
    context: AccessContext,
    path: string,
    value: unknown,
    ifMatch?: string,
  ): Promise<StoredFile>;
  getJson(
    context: AccessContext,
    path: string,
  ): Promise<{ value: unknown; etag: string } | null>;
  getFile(
    context: AccessContext,
    path: string,
    localPath: string,
  ): Promise<void>;
  list(context: AccessContext, folder: string): Promise<StoredFile[]>;
}
