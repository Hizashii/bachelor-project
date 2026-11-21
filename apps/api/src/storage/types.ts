import { z } from "zod";

const safeIdentifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const storageDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inbound-shipments") }),
  z.object({ kind: z.literal("inbound-carrier-imports") }),
  z.object({ kind: z.literal("inbound-invoices") }),
  z.object({ kind: z.literal("datasets-shipments") }),
  z.object({ kind: z.literal("carrier-tariffs"), carrierId: safeIdentifier }),
  z.object({ kind: z.literal("tenders") }),
  z.object({ kind: z.literal("tender"), tenderId: safeIdentifier }),
  z.object({ kind: z.literal("invoice-control") }),
  z.object({ kind: z.literal("import-drafts") }),
  z.object({ kind: z.literal("import-mappings") }),
  z.object({ kind: z.literal("exports") }),
  z.object({ kind: z.literal("audits") }),
]);

export type StorageDestination = z.infer<typeof storageDestinationSchema>;

export const uploadRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        !value.includes("\\") &&
        !value.includes("/") &&
        ![...value].some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        }) &&
        value !== "." &&
        value !== "..",
      "File names cannot contain path separators or control characters.",
    ),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024 * 1024),
  contentType: z.string().trim().min(1).max(200),
  destination: storageDestinationSchema,
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const principalSchema = z.object({
  userId: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(200),
  allowedDestinationKeys: z.array(z.string().min(1).max(200)).max(100),
  permissions: z.object({
    readFiles: z.boolean(),
    readOrganisationFiles: z.boolean(),
    uploadFiles: z.boolean(),
    deleteFiles: z.boolean(),
    deleteOrganisationFiles: z.boolean(),
  }),
});

export type Principal = z.infer<typeof principalSchema>;

export type StoredFile = {
  id: string;
  driveId: string;
  name: string;
  contentType: string;
  size: number;
  ownerId: string;
  organizationId: string;
  destination: StorageDestination;
  uploadedAt: string;
  modifiedAt: string;
  processingStatus: "pending" | "processing" | "processed" | "failed";
  versionId: string;
  eTag: string | null;
  retentionHold: boolean;
  retentionUntil: string | null;
};

export type FilePage = {
  items: StoredFile[];
  nextCursor: string | null;
};

export type UploadSessionStart = {
  uploadId: string;
  chunkSize: number;
  expiresAt: string;
};

export type UploadChunkResult =
  | { completed: false; nextExpectedRanges: string[] }
  | { completed: true; file: StoredFile };

export type DownloadedFile = {
  metadata: StoredFile;
  body: NodeJS.ReadableStream;
};

export type ListFilesInput = {
  destination: StorageDestination;
  cursor: string | undefined;
  pageSize: number;
};

export interface StorageAdapter {
  ensureInitialFolders(): Promise<void>;
  listFiles(principal: Principal, input: ListFilesInput): Promise<FilePage>;
  getFileMetadata(principal: Principal, fileId: string): Promise<StoredFile>;
  initiateUpload(
    principal: Principal,
    input: UploadRequest,
  ): Promise<UploadSessionStart>;
  uploadChunk(
    principal: Principal,
    uploadId: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<UploadChunkResult>;
  downloadFile(principal: Principal, fileId: string): Promise<DownloadedFile>;
  deleteFile(principal: Principal, fileId: string): Promise<void>;
}

export function destinationPath(destination: StorageDestination): string[] {
  switch (destination.kind) {
    case "inbound-shipments":
      return ["inbound", "shipments"];
    case "inbound-carrier-imports":
      return ["inbound", "carrier-imports"];
    case "inbound-invoices":
      return ["inbound", "invoices"];
    case "datasets-shipments":
      return ["datasets", "shipments"];
    case "carrier-tariffs":
      return ["carriers", destination.carrierId, "tariffs"];
    case "tenders":
      return ["tenders"];
    case "tender":
      return ["tenders", destination.tenderId];
    case "invoice-control":
      return ["invoice-control"];
    case "import-drafts":
      return ["imports", "drafts"];
    case "import-mappings":
      return ["imports", "mappings"];
    case "exports":
      return ["exports"];
    case "audits":
      return ["audits"];
  }
}

export function destinationKey(destination: StorageDestination): string {
  return destinationPath(destination).join("/");
}

export function destinationFromPath(path: string): StorageDestination | null {
  const parts = path.split("/");
  if (parts.length === 2 && parts[0] === "inbound") {
    if (parts[1] === "shipments") return { kind: "inbound-shipments" };
    if (parts[1] === "carrier-imports") {
      return { kind: "inbound-carrier-imports" };
    }
    if (parts[1] === "invoices") return { kind: "inbound-invoices" };
  }
  if (path === "datasets/shipments") return { kind: "datasets-shipments" };
  if (path === "imports/drafts") return { kind: "import-drafts" };
  if (path === "imports/mappings") return { kind: "import-mappings" };
  if (parts.length === 3 && parts[0] === "carriers" && parts[2] === "tariffs") {
    const parsed = storageDestinationSchema.safeParse({
      kind: "carrier-tariffs",
      carrierId: parts[1],
    });
    return parsed.success ? parsed.data : null;
  }
  if (parts.length === 2 && parts[0] === "tenders") {
    const parsed = storageDestinationSchema.safeParse({
      kind: "tender",
      tenderId: parts[1],
    });
    return parsed.success ? parsed.data : null;
  }
  if (path === "tenders") return { kind: "tenders" };
  if (path === "invoice-control") return { kind: "invoice-control" };
  if (path === "exports") return { kind: "exports" };
  if (path === "audits") return { kind: "audits" };
  return null;
}
