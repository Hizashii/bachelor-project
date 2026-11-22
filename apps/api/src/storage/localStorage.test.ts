import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LocalStorageAdapter,
  resolveLocalStorageRoot,
} from "./localStorage.ts";
import type { Principal, StorageDestination } from "./types.ts";

const staff: Principal = {
  userId: "staff-1",
  organizationId: "slinkert-aaroe",
  allowedDestinationKeys: ["*"],
  permissions: {
    readFiles: true,
    readOrganisationFiles: true,
    uploadFiles: true,
    deleteFiles: true,
    deleteOrganisationFiles: true,
  },
};

const carrier: Principal = {
  userId: "carrier-1",
  organizationId: "carrier-1",
  allowedDestinationKeys: ["carriers/carrier-1/tariffs"],
  permissions: {
    readFiles: true,
    readOrganisationFiles: false,
    uploadFiles: true,
    deleteFiles: false,
    deleteOrganisationFiles: false,
  },
};

async function storageFixture() {
  const root = await mkdtemp(join(tmpdir(), "freight-local-"));
  const storage = new LocalStorageAdapter(root);
  await storage.ensureInitialFolders();
  return { root, storage };
}

async function upload(
  storage: LocalStorageAdapter,
  principal: Principal,
  name: string,
  body: Buffer,
  destination: StorageDestination,
) {
  const session = await storage.initiateUpload(principal, {
    fileName: name,
    size: body.length,
    contentType: "application/json",
    destination,
  });
  return storage.uploadChunk(
    principal,
    session.uploadId,
    body,
    `bytes 0-${body.length - 1}/${body.length}`,
  );
}

describe("local storage", () => {
  it("persists files, lists them and reopens them after a new adapter", async () => {
    const fixture = await storageFixture();
    try {
      const body = Buffer.from('{"demo":true}', "utf8");
      const result = await upload(
        fixture.storage,
        staff,
        "manifest.json",
        body,
        { kind: "datasets-shipments" },
      );
      expect(result.completed).toBe(true);
      if (!result.completed) return;

      const reopened = new LocalStorageAdapter(fixture.root);
      const listed = await reopened.listFiles(staff, {
        destination: { kind: "datasets-shipments" },
        cursor: undefined,
        pageSize: 25,
      });
      expect(listed.items.map((item) => item.name)).toEqual(["manifest.json"]);
      const downloaded = await reopened.downloadFile(staff, result.file.id);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.body)
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(body);
      expect(
        await readFile(
          join(fixture.root, "datasets", "shipments", "manifest.json"),
        ),
      ).toEqual(body);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects collisions and cross-organisation access", async () => {
    const fixture = await storageFixture();
    try {
      const result = await upload(
        fixture.storage,
        staff,
        "private.json",
        Buffer.from("private"),
        { kind: "datasets-shipments" },
      );
      if (!result.completed) return;
      await expect(
        upload(fixture.storage, staff, "private.json", Buffer.from("again"), {
          kind: "datasets-shipments",
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        fixture.storage.getFileMetadata(carrier, result.file.id),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        fixture.storage.listFiles(carrier, {
          destination: { kind: "datasets-shipments" },
          cursor: undefined,
          pageSize: 25,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps the configured root outside public files", () => {
    expect(() => resolveLocalStorageRoot("public")).toThrow(
      /outside publicly served files/,
    );
  });
});
