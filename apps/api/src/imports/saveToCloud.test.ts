// Tests for cloud saving, temporary files and download links, using an in-memory store.

import { rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../contracts/access.ts";
import {
  type FileStore,
  StorageUnavailableError,
} from "../contracts/fileStore.ts";
import { saveImportToCloud } from "./saveToCloud.ts";
import {
  createDownloadToken,
  createWorkspace,
  resolveDownload,
  sweepExpired,
} from "./tempFiles.ts";

const context: AccessContext = {
  userId: "u1",
  organisationId: "org-1",
  role: "consultant",
};
const summary = {
  rowsRead: 2,
  rowsClean: 2,
  rowsWithIssues: 0,
  issueCounts: { missing: 0, invalid: 0, duplicate: 0, inconsistent: 0 },
  issues: [],
  issuesTruncated: false,
};

function memoryStore(failOn?: string) {
  const paths: string[] = [];
  const put = async (_c: AccessContext, path: string) => {
    if (path.endsWith(failOn ?? "\0")) throw new StorageUnavailableError();
    paths.push(path);
    return { path, etag: "1", sizeBytes: 1 };
  };
  const store: FileStore = {
    putFile: put,
    putJson: put,
    getJson: async () => null,
    getFile: async () => undefined,
    list: async () => [],
  };
  return { store, paths };
}

const input = (store: FileStore) => ({
  context,
  store,
  originalPath: "a.xlsx",
  originalName: "Q1 Shipments.XLSX",
  processedPath: "b.xlsx",
  format: "xlsx" as const,
  mapping: {},
  headers: [],
  summary,
});

describe("saveImportToCloud", () => {
  it("saves five files and writes the manifest last", async () => {
    const { store, paths } = memoryStore();
    const manifest = await saveImportToCloud(input(store));
    expect(paths).toHaveLength(5);
    expect(paths.at(-1)).toMatch(/manifest\.json$/);
    expect(manifest.files.original).toMatch(/original\.xlsx$/);
  });

  it("reports what was saved when storage fails, with no manifest", async () => {
    const { store, paths } = memoryStore("processed.xlsx");
    const error = await saveImportToCloud(input(store)).catch((e) => e);
    expect(error.savedPaths).toHaveLength(1);
    expect(paths.some((p) => p.endsWith("manifest.json"))).toBe(false);
  });
});

describe("temporary files", () => {
  it("lets only the owning organisation use an unexpired link", () => {
    const token = createDownloadToken(context, "/tmp/x", "x.xlsx", 1000);
    expect(resolveDownload(context, token, 2000)?.fileName).toBe("x.xlsx");
    const other = { ...context, organisationId: "org-2" };
    expect(resolveDownload(other, token, 2000)).toBeNull();
    expect(resolveDownload(context, token, 1000 + 31 * 60_000)).toBeNull();
  });

  it("removes old workspace folders and keeps fresh ones", async () => {
    const old = await createWorkspace();
    const fresh = await createWorkspace();
    await writeFile(join(old.dir, "f.txt"), "x");
    const longAgo = new Date(Date.now() - 2 * 60 * 60_000);
    await utimes(old.dir, longAgo, longAgo);
    await sweepExpired();
    await expect(stat(old.dir)).rejects.toThrow();
    await expect(stat(fresh.dir)).resolves.toBeDefined();
    await rm(fresh.dir, { recursive: true });
  });
});
