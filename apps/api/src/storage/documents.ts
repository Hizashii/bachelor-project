// Saving and reading whole files and JSON documents through the SharePoint storage adapter.
// Files are never overwritten: a name that already exists is a conflict, which is how
// concurrent edits are detected. Changed data is saved as a new, numbered file instead.
// Callers check who may touch which data; the adapter still enforces its own folder rules.

import { createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { AccessContext } from "../auth/permissions.ts";
import { workflowPrincipalOf } from "../auth/principal.ts";
import { StorageError } from "./errors.ts";
import type {
  Principal,
  StorageAdapter,
  StorageDestination,
  StoredFile,
} from "./types.ts";

const LIST_PAGE_SIZE = 100;
const JSON_TYPE = "application/json";
const BINARY_TYPE = "application/octet-stream";

export class Documents {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  private principal(context: AccessContext): Principal {
    return workflowPrincipalOf(context);
  }

  async putFile(
    context: AccessContext,
    destination: StorageDestination,
    name: string,
    localPath: string,
    contentType = BINARY_TYPE,
  ): Promise<StoredFile> {
    const principal = this.principal(context);
    const { size } = await stat(localPath);
    const session = await this.storage.initiateUpload(principal, {
      fileName: name,
      size,
      contentType,
      destination,
    });
    const handle = await open(localPath, "r");
    try {
      for (let start = 0; start < size; start += session.chunkSize) {
        const length = Math.min(session.chunkSize, size - start);
        const chunk = Buffer.alloc(length);
        await handle.read(chunk, 0, length, start);
        const result = await this.storage.uploadChunk(
          principal,
          session.uploadId,
          chunk,
          `bytes ${start}-${start + length - 1}/${size}`,
        );
        if (result.completed) return result.file;
      }
    } finally {
      await handle.close();
    }
    throw new StorageError("cloud_unavailable", "The upload did not finish.");
  }

  async putJson(
    context: AccessContext,
    destination: StorageDestination,
    name: string,
    value: unknown,
  ): Promise<StoredFile> {
    const principal = this.principal(context);
    const body = Buffer.from(JSON.stringify(value));
    const session = await this.storage.initiateUpload(principal, {
      fileName: name,
      size: body.byteLength,
      contentType: JSON_TYPE,
      destination,
    });
    const result = await this.storage.uploadChunk(
      principal,
      session.uploadId,
      body,
      `bytes 0-${body.byteLength - 1}/${body.byteLength}`,
    );
    if (!result.completed) {
      throw new StorageError("cloud_unavailable", "The upload did not finish.");
    }
    return result.file;
  }

  async list(
    context: AccessContext,
    destination: StorageDestination,
    namePrefix = "",
  ): Promise<StoredFile[]> {
    const principal = this.principal(context);
    const files: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.storage.listFiles(principal, {
        destination,
        cursor,
        pageSize: LIST_PAGE_SIZE,
      });
      files.push(
        ...page.items.filter((file) => file.name.startsWith(namePrefix)),
      );
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return files;
  }

  async readJson(context: AccessContext, fileId: string): Promise<unknown> {
    const { body } = await this.storage.downloadFile(
      this.principal(context),
      fileId,
    );
    const parts: Buffer[] = [];
    for await (const part of body) parts.push(Buffer.from(part as Uint8Array));
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  }

  async readFile(
    context: AccessContext,
    fileId: string,
    localPath: string,
  ): Promise<void> {
    const { body } = await this.storage.downloadFile(
      this.principal(context),
      fileId,
    );
    await pipeline(body, createWriteStream(localPath));
  }
}
