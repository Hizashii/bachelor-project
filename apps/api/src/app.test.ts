import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app.js";
import type { StorageAdapter } from "./storage/types.js";

describe("file API authorization boundary", () => {
  it("rejects requests when the authentication resolver has no principal", async () => {
    const app = await createApiApp({
      storage: storageStub,
      resolvePrincipal: async () => null,
    });

    const response = await app.inject({ method: "GET", url: "/api/files" });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("keeps folders allowlisted and delegates an authorized upload initiation", async () => {
    const calls: string[] = [];
    const app = await createApiApp({
      storage: {
        ...storageStub,
        initiateUpload: async () => {
          calls.push("initiate");
          return {
            uploadId: "5ea9c6f7-08b8-4b4a-86cb-8c21cb8e9088",
            chunkSize: 320 * 1024,
            expiresAt: "2026-11-14T22:00:00.000Z",
          };
        },
      },
      resolvePrincipal: async () => principal,
    });

    const invalidFolder = await app.inject({
      method: "GET",
      url: "/api/files?folder=https%3A%2F%2Fexample.test%2Fsecret",
    });
    const initiated = await app.inject({
      method: "POST",
      url: "/api/uploads/initiate",
      payload: {
        fileName: "shipment.csv",
        size: 4,
        contentType: "text/csv",
        destination: { kind: "inbound-shipments" },
      },
    });
    await app.close();

    expect(invalidFolder.statusCode).toBe(400);
    expect(initiated.statusCode).toBe(201);
    expect(calls).toEqual(["initiate"]);
  });
});

const principal = {
  userId: "user-1",
  organizationId: "org-1",
  allowedDestinationKeys: ["inbound/shipments", "*"],
  permissions: {
    readFiles: true,
    readOrganisationFiles: true,
    uploadFiles: true,
    deleteFiles: true,
    deleteOrganisationFiles: true,
  },
};

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
