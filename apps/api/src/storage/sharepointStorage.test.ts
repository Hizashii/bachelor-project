import { describe, expect, it } from "vitest";
import { StorageError } from "./errors.ts";
import type {
  GraphChunkResult,
  GraphDriveItem,
  GraphGateway,
  GraphPage,
  GraphVersion,
} from "./graphClient.ts";
import { SharePointStorageAdapter } from "./sharepointStorage.ts";
import type { Principal, StorageDestination, UploadRequest } from "./types.ts";

const principal: Principal = {
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

const destination: StorageDestination = { kind: "inbound-shipments" };
const uploadRequest: UploadRequest = {
  fileName: "shipment.csv",
  size: 4,
  contentType: "text/csv",
  destination,
};

describe("SharePointStorageAdapter", () => {
  it("uploads, identifies the latest version and downloads content", async () => {
    const graph = new FakeGraph();
    const adapter = createAdapter(graph);
    const session = await adapter.initiateUpload(principal, uploadRequest);

    const result = await adapter.uploadChunk(
      principal,
      session.uploadId,
      new TextEncoder().encode("data"),
      "bytes 0-3/4",
    );

    expect(result.completed).toBe(true);
    if (!result.completed) throw new Error("Expected upload completion.");
    expect(result.file.versionId).toBe("v2");
    const downloaded = await adapter.downloadFile(principal, result.file.id);
    const chunks: Uint8Array[] = [];
    for await (const chunk of downloaded.body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    expect(new TextDecoder().decode(concat(chunks))).toBe("data");
  });

  it("rejects unauthorised and wrong-organisation access", async () => {
    const graph = new FakeGraph();
    graph.addFile("private.txt", "org-1", "owner-2");
    const adapter = createAdapter(graph);
    const noRead = {
      ...principal,
      permissions: { ...principal.permissions, readFiles: false },
    };

    await expect(
      adapter.getFileMetadata(noRead, "file-1"),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      adapter.getFileMetadata(
        { ...principal, organizationId: "org-2" },
        "file-1",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("returns missing files and detects filename conflicts", async () => {
    const graph = new FakeGraph();
    const adapter = createAdapter(graph);
    await adapter.ensureInitialFolders();
    graph.addFile("shipment.csv", "org-1", "user-1");

    await expect(
      adapter.getFileMetadata(principal, "missing"),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      adapter.initiateUpload(principal, uploadRequest),
    ).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("continues an interrupted upload and rejects revoked upload permissions", async () => {
    const graph = new FakeGraph();
    const adapter = createAdapter(graph);
    const session = await adapter.initiateUpload(principal, uploadRequest);

    const first = await adapter.uploadChunk(
      principal,
      session.uploadId,
      new TextEncoder().encode("da"),
      "bytes 0-1/4",
    );
    expect(first).toEqual({ completed: false, nextExpectedRanges: ["2-"] });

    const revoked = {
      ...principal,
      permissions: { ...principal.permissions, uploadFiles: false },
    };
    await expect(
      adapter.uploadChunk(
        revoked,
        session.uploadId,
        new TextEncoder().encode("ta"),
        "bytes 2-3/4",
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    const completed = await adapter.uploadChunk(
      principal,
      session.uploadId,
      new TextEncoder().encode("ta"),
      "bytes 2-3/4",
    );
    expect(completed.completed).toBe(true);
  });

  it("expires abandoned upload sessions", async () => {
    const graph = new FakeGraph();
    const adapter = createAdapter(graph, { uploadSessionTtlMs: 1 });
    const session = await adapter.initiateUpload(principal, uploadRequest);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(
      adapter.uploadChunk(
        principal,
        session.uploadId,
        new TextEncoder().encode("data"),
        "bytes 0-3/4",
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

class FakeGraph implements GraphGateway {
  private readonly items = new Map<string, GraphDriveItem>();
  private readonly fields = new Map<string, Record<string, unknown>>();
  private readonly children = new Map<string, string[]>();
  private readonly contents = new Map<string, Uint8Array>();
  private readonly folderByName = new Map<string, string>();
  private inboundShipmentsFolderId: string | null = null;
  private nextId = 1;

  constructor() {
    this.items.set("root", { id: "root", name: "Root", folder: {} });
    this.children.set("root", []);
  }

  addFile(name: string, organizationId: string, ownerId: string): string {
    const id = `file-${this.nextId++}`;
    this.items.set(id, {
      id,
      name,
      size: 4,
      eTag: "etag-1",
      createdDateTime: "2026-01-01T00:00:00.000Z",
      lastModifiedDateTime: "2026-01-01T00:00:00.000Z",
      file: { mimeType: "text/plain" },
    });
    this.fields.set(id, {
      FreightOrganisationId: organizationId,
      FreightOwnerId: ownerId,
      FreightFileId: id,
      FreightDestination: "inbound/shipments",
      FreightProcessingStatus: "processed",
    });
    this.children.get(this.inboundShipmentsFolderId ?? "root")?.push(id);
    return id;
  }

  async listChildren(
    _driveId: string,
    parentItemId: string,
    _nextLink: string | null,
    _pageSize: number,
  ): Promise<GraphPage<GraphDriveItem>> {
    const ids = this.children.get(parentItemId) ?? [];
    return {
      value: ids.map((id) => this.items.get(id) as GraphDriveItem),
      nextLink: null,
    };
  }

  async getDriveItem(
    _driveId: string,
    itemId: string,
  ): Promise<GraphDriveItem> {
    const item = this.items.get(itemId);
    if (!item) throw new StorageError("not_found", "missing");
    return item;
  }

  async getItemFields(
    _driveId: string,
    itemId: string,
  ): Promise<Record<string, unknown>> {
    return this.fields.get(itemId) ?? {};
  }

  async patchItemFields(
    _driveId: string,
    itemId: string,
    fields: Record<string, string | boolean>,
  ): Promise<void> {
    this.fields.set(itemId, { ...(this.fields.get(itemId) ?? {}), ...fields });
  }

  async createFolder(
    _driveId: string,
    parentItemId: string,
    name: string,
  ): Promise<GraphDriveItem> {
    const existing = await this.listChildren("drive", parentItemId, null, 100);
    if (existing.value.some((item) => item.name === name)) {
      throw new StorageError("conflict", "conflict");
    }
    const id = `folder-${this.nextId++}`;
    const folder = { id, name, folder: {} } satisfies GraphDriveItem;
    this.items.set(id, folder);
    this.children.set(id, []);
    this.folderByName.set(name, id);
    if (
      name === "shipments" &&
      this.items.get(parentItemId)?.name === "inbound"
    ) {
      this.inboundShipmentsFolderId = id;
    }
    this.children.get(parentItemId)?.push(id);
    return folder;
  }

  async createUploadSession(
    _driveId: string,
    _parentItemId: string,
    _fileName: string,
  ): Promise<{ uploadUrl: string; expirationDateTime: string }> {
    return {
      uploadUrl: "https://upload.example/session",
      expirationDateTime: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  async uploadChunk(
    _uploadUrl: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<GraphChunkResult> {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    if (!match) throw new Error("invalid range");
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    const id = "file-uploaded";
    const current = this.contents.get(id) ?? new Uint8Array(total);
    current.set(chunk, start);
    this.contents.set(id, current);
    if (end + 1 < total) return { nextExpectedRanges: [`${end + 1}-`] };
    const item: GraphDriveItem = {
      id,
      name: "shipment.csv",
      size: total,
      eTag: "etag-uploaded",
      createdDateTime: "2026-01-01T00:00:00.000Z",
      lastModifiedDateTime: "2026-01-01T00:00:00.000Z",
      file: { mimeType: "text/csv" },
    };
    this.items.set(id, item);
    if (!this.children.get("folder-1")) this.children.set("folder-1", []);
    this.children.get("folder-1")?.push(id);
    return { item };
  }

  async downloadFile(_driveId: string, itemId: string): Promise<Response> {
    return new Response(
      new TextDecoder().decode(
        this.contents.get(itemId) ?? new TextEncoder().encode("data"),
      ),
    );
  }

  async listVersions(
    _driveId: string,
    _itemId: string,
  ): Promise<GraphVersion[]> {
    return [{ id: "v2" }];
  }

  async deleteItem(_driveId: string, itemId: string): Promise<void> {
    this.items.delete(itemId);
  }
}

function createAdapter(
  graph: FakeGraph,
  overrides: { uploadSessionTtlMs?: number } = {},
): SharePointStorageAdapter {
  return new SharePointStorageAdapter(graph, {
    driveId: "drive",
    rootItemId: "root",
    cursorSecret: "test-secret",
    chunkSizeBytes: 320 * 1024,
    ...overrides,
  });
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
