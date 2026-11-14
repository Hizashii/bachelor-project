// Tests for saved column setups and cloud drafts. Storage is an in-memory test double.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../contracts/access.ts";
import { createMemoryStore, rolePermissions } from "../testing/memoryStore.ts";
import { ImportService } from "./importService.ts";
import { DraftNotFoundError, ImportLibrary } from "./library.ts";
import { createWorkspace } from "./tempFiles.ts";

const staff: AccessContext = {
  userId: "s1",
  organisationId: "sa",
  role: "consultant",
};
const other: AccessContext = {
  userId: "s2",
  organisationId: "other",
  role: "consultant",
};
const csv = "Ref;Fra;Til\nS-1;8300;2680\n";

function setup() {
  const store = createMemoryStore();
  const imports = new ImportService({ store, permissions: rolePermissions });
  return { library: new ImportLibrary(imports, store), imports };
}

async function upload(library: ImportLibrary, context = staff) {
  const workspace = await createWorkspace();
  const path = join(workspace.dir, "upload.tmp");
  await writeFile(path, csv);
  return library.openUpload(context, workspace, "Rates.csv", path);
}

describe("saved column setups", () => {
  it("recognises a known layout on the next upload and versions each change", async () => {
    const { library } = setup();
    const first = await upload(library);
    expect(first.knownTemplate).toBeNull();
    const mapping = { reference: 0, originPostcode: 1, destinationPostcode: 2 };
    const v1 = await library.rememberMapping(
      staff,
      first.sessionId,
      "Carrier A",
      mapping,
    );
    const v2 = await library.rememberMapping(
      staff,
      first.sessionId,
      "Carrier A",
      { ...mapping, carrier: 0 },
    );
    expect([v1.version, v2.version]).toEqual([1, 2]);

    const second = await upload(library);
    expect(second.knownTemplate).toEqual({ name: "Carrier A", version: 2 });
    expect(second.inspection.mapping).toMatchObject({ carrier: 0 });
  });

  it("does not share setups between organisations", async () => {
    const { library } = setup();
    const first = await upload(library);
    await library.rememberMapping(staff, first.sessionId, "A", {
      reference: 0,
    });
    expect((await upload(library, other)).knownTemplate).toBeNull();
  });
});

describe("drafts", () => {
  it("saves, lists, reopens with the same choices and hides a discarded draft", async () => {
    const { library } = setup();
    const opened = await upload(library);
    const mapping = { reference: 0, originPostcode: 1, destinationPostcode: 2 };
    const draft = await library.saveDraft(
      staff,
      opened.sessionId,
      mapping,
      "csv",
    );
    expect(await library.listDrafts(staff)).toHaveLength(1);

    const again = await library.saveDraft(
      staff,
      opened.sessionId,
      { ...mapping, carrier: 0 },
      "csv",
    );
    expect(again.draftId).toBe(draft.draftId);
    expect(await library.listDrafts(staff)).toHaveLength(1);

    const reopened = await library.reopenDraft(staff, draft.draftId);
    expect(reopened.inspection.mapping).toMatchObject({ carrier: 0 });
    expect(reopened.inspection.headers).toEqual(["Ref", "Fra", "Til"]);

    await library.discardDraft(staff, draft.draftId);
    expect(await library.listDrafts(staff)).toHaveLength(0);
    await expect(
      library.reopenDraft(staff, draft.draftId),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
  });

  it("cannot reopen another organisation's draft", async () => {
    const { library } = setup();
    const opened = await upload(library);
    const draft = await library.saveDraft(
      staff,
      opened.sessionId,
      { reference: 0 },
      "csv",
    );
    await expect(
      library.reopenDraft(other, draft.draftId),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
  });
});
