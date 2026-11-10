// This file provides a deterministic storage implementation for tests and local demos.

import type { Storage, StoredFile } from "./types.ts";

export class InMemoryStorage implements Storage {
  private readonly files = new Map<string, StoredFile>();

  public async read(path: string): Promise<StoredFile | null> {
    return this.files.get(path) ?? null;
  }

  public async write(path: string, content: string, expectedEtag?: string): Promise<StoredFile> {
    const current = this.files.get(path);
    if (expectedEtag !== undefined && current?.etag !== expectedEtag) {
      throw new Error("Storage changed before the write completed.");
    }

    const next = { path, content, etag: String((Number(current?.etag) || 0) + 1) };
    this.files.set(path, next);
    return next;
  }

  public async archive(path: string): Promise<void> {
    const current = this.files.get(path);
    if (!current) return;
    this.files.set(`archive/${path}`, current);
    this.files.delete(path);
  }
}
