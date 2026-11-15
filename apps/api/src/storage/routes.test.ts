import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/testApp.ts";
import { testDatabaseUrl } from "../testing/testDatabase.ts";
import type { Principal, StorageAdapter } from "./types.ts";

let open: Awaited<ReturnType<typeof createTestApp>> | null = null;
afterEach(async () => {
  await open?.database.end();
  open = null;
});

async function appWith(storage: StorageAdapter) {
  open = await createTestApp(storage);
  const t = open;
  await t.addUser({ email: "staff@example.test", role: "consultant" });
  const carrier = await t.accounts.createCarrier(
    "Blue Fjord ApS",
    "Blue Fjord",
  );
  await t.addUser({
    email: "dana@blue.test",
    role: "carrier",
    carrierId: carrier.id,
  });
  return { t, carrierId: carrier.id };
}

describe.skipIf(!testDatabaseUrl)("file API authorization boundary", () => {
  it("rejects requests without a signed-in session", async () => {
    const { t } = await appWith(storageStub);
    const response = await t.app.inject({ method: "GET", url: "/api/files" });
    expect(response.statusCode).toBe(401);
  });

  it("keeps folders allowlisted and delegates an authorized upload initiation", async () => {
    const calls: string[] = [];
    const { t } = await appWith({
      ...storageStub,
      initiateUpload: async () => {
        calls.push("initiate");
        return {
          uploadId: "5ea9c6f7-08b8-4b4a-86cb-8c21cb8e9088",
          chunkSize: 320 * 1024,
          expiresAt: "2026-11-14T22:00:00.000Z",
        };
      },
    });
    const { headers } = await t.login("staff@example.test");

    const invalidFolder = await t.app.inject({
      method: "GET",
      url: "/api/files?folder=https%3A%2F%2Fexample.test%2Fsecret",
      headers,
    });
    const initiated = await t.app.inject({
      method: "POST",
      url: "/api/uploads/initiate",
      headers,
      payload: {
        fileName: "shipment.csv",
        size: 4,
        contentType: "text/csv",
        destination: { kind: "inbound-shipments" },
      },
    });
    const withoutCsrf = await t.app.inject({
      method: "POST",
      url: "/api/uploads/initiate",
      headers: { cookie: headers.cookie, origin: headers.origin },
      payload: {
        fileName: "a.csv",
        size: 4,
        contentType: "text/csv",
        destination: { kind: "inbound-shipments" },
      },
    });

    expect(invalidFolder.statusCode).toBe(400);
    expect(initiated.statusCode).toBe(201);
    expect(withoutCsrf.statusCode).toBe(403);
    expect(calls).toEqual(["initiate"]);
  });

  it("gives a carrier a principal limited to its own company folders", async () => {
    const seen: Principal[] = [];
    const { t, carrierId } = await appWith({
      ...storageStub,
      listFiles: async (principal) => {
        seen.push(principal);
        return { items: [], nextCursor: null };
      },
    });
    const { headers } = await t.login("dana@blue.test");
    await t.app.inject({
      method: "GET",
      url: "/api/files?folder=inbound/carrier-imports",
      headers,
    });

    expect(seen[0]).toMatchObject({
      organizationId: carrierId,
      permissions: { readOrganisationFiles: false, deleteFiles: false },
    });
    expect(seen[0]?.allowedDestinationKeys).toEqual([
      "inbound/carrier-imports",
      `carriers/${carrierId}/tariffs`,
    ]);
  });
});

const storageStub: StorageAdapter = {
  ensureInitialFolders: async () => {},
  listFiles: async () => ({ items: [], nextCursor: null }),
  getFileMetadata: async () => {
    throw new Error("not used");
  },
  initiateUpload: async () => {
    throw new Error("not used");
  },
  uploadChunk: async () => {
    throw new Error("not used");
  },
  downloadFile: async () => ({
    metadata: {
      id: "file-1",
      driveId: "drive-1",
      name: "shipment.csv",
      contentType: "text/csv",
      size: 0,
      ownerId: "user-1",
      organizationId: "org-1",
      destination: { kind: "inbound-shipments" },
      uploadedAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: "2026-01-01T00:00:00.000Z",
      processingStatus: "pending",
      versionId: "v1",
      eTag: null,
      retentionHold: false,
      retentionUntil: null,
    },
    body: Readable.from([]),
  }),
  deleteFile: async () => {},
};
