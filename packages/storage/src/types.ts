// This file defines storage contracts and contains no SharePoint or database client.

export type StoredFile = {
  path: string;
  etag: string;
  content: string;
};

export interface Storage {
  read(path: string): Promise<StoredFile | null>;
  write(path: string, content: string, expectedEtag?: string): Promise<StoredFile>;
  archive(path: string): Promise<void>;
}

export interface SharePointFileClient {
  read(path: string): Promise<StoredFile | null>;
  write(path: string, content: string, expectedEtag?: string): Promise<StoredFile>;
  moveToArchive(path: string): Promise<void>;
}
