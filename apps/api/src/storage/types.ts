// This file is the only contract for reading and writing files in the data library.
// Implementations: memoryStore.ts (tests) and graphStore.ts (SharePoint through Graph).
// ifMatch: an ETag means "update only if unchanged"; null means "create only, never overwrite".

export type Versioned<T> = { data: T; etag: string };

export interface FileStore {
  readJson(path: string): Promise<Versioned<unknown> | null>;
  writeJson(
    path: string,
    data: unknown,
    ifMatch: string | null,
  ): Promise<{ etag: string }>;
  readBytes(path: string): Promise<Versioned<Uint8Array> | null>;
  writeBytes(
    path: string,
    bytes: Uint8Array,
    ifMatch: string | null,
  ): Promise<{ etag: string }>;
  list(directory: string): Promise<string[]>;
  appendLine(path: string, line: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}
