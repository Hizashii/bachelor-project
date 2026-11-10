import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApi } from "../app.ts";
import { loadApiEnvironment } from "../config/env.ts";
import type { Principal, StorageAdapter } from "./types.ts";

const environment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
  AUTH_MODE: "mock",
});

async function signIn(app: ReturnType<typeof buildApi>, identity: string) {
  const response = await app.inject({
    method: "GET",
    url: `/auth/mock/login?identity=${identity}`,
  });
  const cookie = response.headers["set-cookie"];
  const first = Array.isArray(cookie) ? cookie[0] : cookie;
  return String(first).split(";", 1)[0] ?? "";
}

describe("file API authorization boundary", () => {
  it("rejects requests without a signed-in session", async () => {
    const app = buildApi({ environment, storage: storageStub });
    const response = await app.inject({ method: "GET", url: "/api/files" });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it("keeps folders allowlisted and delegates an authorized upload initiation", async () => {
    const calls: string[] = [];
    const app = buildApi({
      environment,
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
    });
    const headers = { cookie: await signIn(app, "consultant") };

    const invalidFolder = await app.inject({
      method: "GET",
      url: "/api/files?folder=https%3A%2F%2Fexample.test%2Fsecret",
      headers,
    });
    const initiated = await app.inject({
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
    await app.close();

    expect(invalidFolder.statusCode).toBe(400);
    expect(initiated.statusCode).toBe(201);
    expect(calls).toEqual(["initiate"]);
  });

  it("gives a carrier a principal limited to its own company folders", async () => {
    const seen: Principal[] = [];
    const app = buildApi({
      environment,
      storage: {
        ...storageStub,
        listFiles: async (principal) => {
          seen.push(principal);
          return { items: [], nextCursor: null };
        },
      },
    });
    const headers = { cookie: await signIn(app, "carrier") };
    await app.inject({
      method: "GET",
      url: "/api/files?folder=inbound/carrier-imports",
      headers,
    });
    await app.close();

    expect(seen[0]).toMatchObject({
      organizationId: "carrier-blue-fjord",
      permissions: { readOrganisationFiles: false, deleteFiles: false },
    });
    expect(seen[0]?.allowedDestinationKeys).toEqual([
      "inbound/carrier-imports",
      "carriers/carrier-blue-fjord/tariffs",
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
