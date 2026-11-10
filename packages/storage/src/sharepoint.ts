// This file adapts an approved SharePoint client to the storage contract.

import type { SharePointFileClient, Storage, StoredFile } from "./types.ts";

export class SharePointStorage implements Storage {
  public constructor(private readonly client: SharePointFileClient) {}

  public read(path: string): Promise<StoredFile | null> {
    return this.client.read(path);
  }

  public write(path: string, content: string, expectedEtag?: string): Promise<StoredFile> {
    return this.client.write(path, content, expectedEtag);
  }

  public archive(path: string): Promise<void> {
    return this.client.moveToArchive(path);
  }
}
