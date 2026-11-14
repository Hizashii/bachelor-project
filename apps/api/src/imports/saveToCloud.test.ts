// Tests for cloud saving, temporary files and download links, using an in-memory store.

import { rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
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

async function inputFor(failOn?: string) {
  const storage = createMemoryStorage();
  if (failOn) {
    const initiate = storage.initiateUpload;
    storage.initiateUpload = async (principal, request) => {
      if (request.fileName.endsWith(failOn)) {
        throw new StorageError("cloud_unavailable", "down");
      }
      return initiate(principal, request);
    };
  }
  const workspace = await createWorkspace();
  const originalPath = join(workspace.dir, "a.xlsx");
  const processedPath = join(workspace.dir, "b.xlsx");
  await writeFile(originalPath, "original");
  await writeFile(processedPath, "processed");
  return {
    storage,
    input: {
      context,
      documents: new Documents(storage),
      originalPath,
      originalName: "Q1 Shipments.XLSX",
      processedPath,
      format: "xlsx" as const,
      mapping: {},
      headers: [],
      summary,
    },
  };
}

describe("saveImportToCloud", () => {
  it("saves five files and writes the manifest last", async () => {
    const { storage, input } = await inputFor();
    const manifest = await saveImportToCloud(input);
    const names = [...storage.entries.values()].map((entry) => entry.file.name);
    expect(names).toHaveLength(5);
    expect(names.at(-1)).toMatch(/manifest\.json$/);
    expect(manifest.files.original).toMatch(/original\.xlsx$/);
  });

  it("reports what was saved when storage fails, with no manifest", async () => {
    const { storage, input } = await inputFor("processed.xlsx");
    const error = await saveImportToCloud(input).catch((e) => e);
    expect(error.savedPaths).toHaveLength(1);
    const names = [...storage.entries.values()].map((entry) => entry.file.name);
    expect(names.some((name) => name.endsWith("manifest.json"))).toBe(false);
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
