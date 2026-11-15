// End-to-end tests of the import use cases with test doubles for storage and permissions.
// Covers: open, preview, process, download-only, save to cloud, storage failure, cleanup.

import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { permissions } from "../auth/permissions.ts";
import { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
import { waitFor } from "../testing/waitFor.ts";
import {
  ImportAccessError,
  ImportService,
  ImportStateError,
} from "./importService.ts";
import { createWorkspace, resolveDownload } from "./tempFiles.ts";

const staff: AccessContext = {
  userId: "s1",
  organisationId: "sa",
  role: "consultant",
};
const other: AccessContext = {
  userId: "s2",
  organisationId: "other",
  role: "carrier",
};
const csv =
  "Ref;Fra postnr;Til postnr;Vægt (kg)\nS-1;8300;2680;250\nS-2;8300;2700;abc\n";

async function openFile(service: ImportService) {
  const workspace = await createWorkspace();
  const received = join(workspace.dir, "upload.tmp");
  await writeFile(received, csv);
  const { sessionId, inspection } = await service.open(
    staff,
    workspace,
    "Q1 shipments.csv",
    received,
  );
  return { sessionId, inspection, workspace };
}

const jobDone = (service: ImportService, id: string) =>
  waitFor(() => {
    const state = service.job(staff, id)?.state;
    return state === "completed" || state === "failed";
  });

describe("ImportService", () => {
  it("processes a file and offers a download without saving anything to the cloud", async () => {
    const storage = createMemoryStorage();
    const documents = new Documents(storage);
    const service = new ImportService({ documents, permissions });
    const { sessionId, inspection } = await openFile(service);
    expect(inspection.missingRequired).toEqual([]);

    const preview = await service.previewCleaning(
      staff,
      sessionId,
      inspection.mapping,
    );
    expect(preview[1]?.issues.map((i) => i.field)).toContain("weightKg");

    service.start(staff, sessionId, inspection.mapping, "xlsx");
    await jobDone(service, sessionId);
    expect(service.job(staff, sessionId)).toMatchObject({ state: "completed" });

    const token = service.download(staff, sessionId);
    const file = resolveDownload(staff, token);
    expect(file?.fileName).toBe("Q1 shipments-processed.xlsx");
    await expect(stat(file?.path ?? "")).resolves.toBeDefined();
    expect(storage.entries.size).toBe(0);
  });

  it("saves to the cloud only after processing finished", async () => {
    const storage = createMemoryStorage();
    const documents = new Documents(storage);
    const service = new ImportService({ documents, permissions });
    const { sessionId, inspection } = await openFile(service);
    await expect(service.saveToCloud(staff, sessionId)).rejects.toBeInstanceOf(
      ImportStateError,
    );
    service.start(staff, sessionId, inspection.mapping, "csv");
    await jobDone(service, sessionId);
    const manifest = await service.saveToCloud(staff, sessionId);
    expect(manifest.rows.rowsRead).toBe(2);
    expect(storage.entries.size).toBe(5);
  });

  it("reports a storage failure without claiming success", async () => {
    const storage = createMemoryStorage();
    storage.uploadChunk = async () => {
      throw new StorageError("cloud_unavailable", "down");
    };
    const service = new ImportService({
      documents: new Documents(storage),
      permissions,
    });
    const { sessionId, inspection } = await openFile(service);
    service.start(staff, sessionId, inspection.mapping, "csv");
    await jobDone(service, sessionId);
    await expect(service.saveToCloud(staff, sessionId)).rejects.toThrow(
      "Saving to Microsoft 365 failed.",
    );
  });

  it("hides sessions from other organisations and removes temporary files on discard", async () => {
    const service = new ImportService({
      documents: new Documents(createMemoryStorage()),
      permissions,
    });
    const { sessionId, workspace } = await openFile(service);
    expect(() => service.job(other, sessionId)).toThrow(ImportAccessError);
    await service.discard(staff, sessionId);
    await expect(stat(workspace.dir)).rejects.toThrow();
  });
});
