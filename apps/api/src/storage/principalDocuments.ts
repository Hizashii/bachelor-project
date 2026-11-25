// Principal-based document access for tender bid drafts and template bindings.
// It deliberately stores new revisions as new files: an existing name is a
// conflict, which makes a stale revision impossible to overwrite silently.

import { StorageError } from "./errors.ts";
import type {
  Principal,
  StorageAdapter,
  StorageDestination,
  StoredFile,
} from "./types.ts";

const PAGE_SIZE = 100;

export class PrincipalDocuments {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async putJson(
    principal: Principal,
    destination: StorageDestination,
    name: string,
    value: unknown,
  ): Promise<StoredFile> {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    const session = await this.storage.initiateUpload(principal, {
      fileName: name,
      size: body.byteLength,
      contentType: "application/json",
      destination,
    });
    const result = await this.storage.uploadChunk(
      principal,
      session.uploadId,
      body,
      `bytes 0-${body.byteLength - 1}/${body.byteLength}`,
    );
    if (!result.completed) {
      throw new StorageError(
        "cloud_unavailable",
        "The document upload did not finish.",
      );
    }
    return result.file;
  }

  async list(
    principal: Principal,
    destination: StorageDestination,
    prefix = "",
  ): Promise<StoredFile[]> {
    const files: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.storage.listFiles(principal, {
        destination,
        cursor,
        pageSize: PAGE_SIZE,
      });
      files.push(...page.items.filter((file) => file.name.startsWith(prefix)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return files;
  }

  /**
   * Read only a named, non-commercial tender document for an invited carrier.
   * The storage adapter normally hides organisation-owned files from carriers;
   * this narrow helper temporarily widens that check, then filters by the
   * caller-supplied prefix before any content is read.
   */
  async listShared(
    principal: Principal,
    destination: StorageDestination,
    prefix: string,
  ): Promise<StoredFile[]> {
    const sharedPrincipal: Principal = {
      ...principal,
      permissions: { ...principal.permissions, readOrganisationFiles: true },
    };
    return this.list(sharedPrincipal, destination, prefix);
  }

  async readJson(principal: Principal, fileId: string): Promise<unknown> {
    return this.readJsonWithPrincipal(principal, fileId);
  }

  async readSharedJson(principal: Principal, fileId: string): Promise<unknown> {
    return this.readJsonWithPrincipal(
      {
        ...principal,
        permissions: { ...principal.permissions, readOrganisationFiles: true },
      },
      fileId,
    );
  }

  private async readJsonWithPrincipal(
    principal: Principal,
    fileId: string,
  ): Promise<unknown> {
    const downloaded = await this.storage.downloadFile(principal, fileId);
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }
}
