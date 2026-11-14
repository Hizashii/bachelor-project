import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import type { PrincipalResolver } from "./auth.js";
import { StorageError } from "./storage/errors.js";
import type { StorageAdapter } from "./storage/types.js";
import { destinationFromPath, uploadRequestSchema } from "./storage/types.js";

export type ApiAppOptions = {
  storage: StorageAdapter;
  resolvePrincipal: PrincipalResolver;
};

const fileIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._~-]+$/);
const uploadIdSchema = z.string().uuid();
const MAX_UPLOAD_CHUNK_BYTES = 60 * 1024 * 1024;
const listQuerySchema = z.object({
  folder: z.string().default("inbound/shipments"),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function createApiApp(
  options: ApiAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_UPLOAD_CHUNK_BYTES,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && origin === process.env.APP_ORIGIN) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Content-Range",
      );
      reply.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
    }
    if (request.method === "OPTIONS") return reply.code(204).send();
  });

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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof StorageError) {
      if (error.retryAfterSeconds !== null) {
        reply.header("Retry-After", String(Math.ceil(error.retryAfterSeconds)));
      }
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }
    requestLogSafe(error);
    return reply.code(500).send({
      error: "internal_error",
      message: "The request could not be completed.",
    });
  });

  return app;
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

function requestLogSafe(error: unknown): void {
  if (error instanceof Error) console.error(error.message);
}

function safeHeaderFileName(name: string): string {
  return [...name]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? "_" : character;
    })
    .join("");
}
