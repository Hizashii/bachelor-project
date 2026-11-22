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

describe("document template registry authorization boundary", () => {
  it("requires an authenticated principal with template permission", async () => {
    const unauthenticatedApp = await createApiApp({
      storage: storageStub,
      resolvePrincipal: async () => null,
    });
    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/api/documents/templates",
    });
    await unauthenticatedApp.close();

    const deniedApp = await createApiApp({
      storage: storageStub,
      resolvePrincipal: async () => ({
        ...principal,
        permissions: { ...principal.permissions, readTemplates: false },
      }),
    });
    const denied = await deniedApp.inject({
      method: "GET",
      url: "/api/documents/templates",
    });
    await deniedApp.close();

    expect(unauthenticated.statusCode).toBe(401);
    expect(denied.statusCode).toBe(403);
  });

  it("returns immutable registry metadata and a versioned contract", async () => {
    const app = await createApiApp({
      storage: storageStub,
      resolvePrincipal: async () => principal,
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/documents/templates",
    });
    const detail = await app.inject({
      method: "GET",
      url: "/api/documents/templates/express-price/versions/1.0.0",
    });
    await app.close();

    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);
    expect(list.json().items[1]).toMatchObject({
      id: "express-price",
      version: "1.0.0",
      mappingStatus: "unverified",
      immutable: true,
      source: {
        fileName: "price_template express.xlsx",
        sha256:
          "FA5B5EE75EBBC8D01AA8D6E3DA6905BBFE7CC404A7EFE49A42B67D61BA9DD9D4",
      },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: "express-price",
      version: "1.0.0",
      blankContract: {
        commercialInputsBlank: true,
        businessRows: 0,
        formulasExecuted: false,
      },
    });
  });
});

const principal = {
  userId: "user-1",
  organizationId: "org-1",
  role: "staff" as const,
  allowedDestinationKeys: ["inbound/shipments", "*"],
  permissions: {
    readFiles: true,
    readOrganisationFiles: true,
    readTemplates: true,
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
