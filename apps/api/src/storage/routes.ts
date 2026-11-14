// File routes over the SharePoint storage adapter: list, upload in chunks, download, delete.
// Who may do what is decided by the Principal and by the adapter; routes only validate input.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PrincipalResolver } from "../auth.ts";
import type { StorageAdapter } from "./types.ts";
import { destinationFromPath, uploadRequestSchema } from "./types.ts";

export type FileRoutesOptions = {
  storage: StorageAdapter;
  resolvePrincipal: PrincipalResolver;
};

const fileIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._~-]+$/);
const uploadIdSchema = z.string().uuid();
const listQuerySchema = z.object({
  folder: z.string().default("inbound/shipments"),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function registerFileRoutes(
  app: FastifyInstance,
  options: FileRoutesOptions,
): void {
  app.get("/api/files", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendInvalid(reply, parsed.error.message);
    const destination = destinationFromPath(parsed.data.folder);
    if (!destination)
      return sendInvalid(
        reply,
        "The requested storage folder is not supported.",
      );
    return options.storage.listFiles(principal, {
      destination,
      cursor: parsed.data.cursor,
      pageSize: parsed.data.pageSize,
    });
  });

  app.get("/api/files/:id", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const fileId = parseParam(request, "id", fileIdSchema);
    if (!fileId) return sendInvalid(reply, "The file identifier is invalid.");
    return options.storage.getFileMetadata(principal, fileId);
  });

  app.post("/api/uploads/initiate", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const parsed = uploadRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendInvalid(reply, parsed.error.message);
    const result = await options.storage.initiateUpload(principal, parsed.data);
    return reply.code(201).send(result);
  });

  app.put("/api/uploads/:uploadId", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const uploadId = parseParam(request, "uploadId", uploadIdSchema);
    if (!uploadId)
      return sendInvalid(reply, "The upload identifier is invalid.");
    const contentRange = request.headers["content-range"];
    if (typeof contentRange !== "string") {
      return sendInvalid(reply, "Content-Range is required for upload chunks.");
    }
    const body = request.body;
    if (!(body instanceof Buffer) && !(body instanceof Uint8Array)) {
      return sendInvalid(reply, "Upload chunks must be sent as binary data.");
    }
    const result = await options.storage.uploadChunk(
      principal,
      uploadId,
      body,
      contentRange,
    );
    return reply.code(result.completed ? 201 : 202).send(result);
  });

  app.get("/api/files/:id/download", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const fileId = parseParam(request, "id", fileIdSchema);
    if (!fileId) return sendInvalid(reply, "The file identifier is invalid.");
    const result = await options.storage.downloadFile(principal, fileId);
    reply.type(result.metadata.contentType);
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeHeaderFileName(result.metadata.name))}`,
    );
    return reply.send(result.body);
  });

  app.delete("/api/files/:id", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const fileId = parseParam(request, "id", fileIdSchema);
    if (!fileId) return sendInvalid(reply, "The file identifier is invalid.");
    await options.storage.deleteFile(principal, fileId);
    return reply.code(204).send();
  });
}

async function requirePrincipal(
  resolvePrincipal: PrincipalResolver,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<PrincipalResolver>> | null> {
  const principal = await resolvePrincipal(request);
  if (principal) return principal;
  reply.code(401).send({
    error: "unauthenticated",
    message: "Sign in is required to access cloud files.",
  });
  return null;
}

function parseParam<T extends z.ZodType<string>>(
  request: FastifyRequest,
  key: string,
  schema: T,
): string | null {
  const params = request.params as Record<string, unknown>;
  const parsed = schema.safeParse(params[key]);
  return parsed.success ? parsed.data : null;
}

function sendInvalid(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: "invalid_request", message });
}

function safeHeaderFileName(name: string): string {
  return [...name]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? "_" : character;
    })
    .join("");
}
