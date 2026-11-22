import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  findTemplateVersion,
  listTemplateVersions,
} from "@freight-desk/shared";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import type { PrincipalResolver } from "./auth.js";
import { Documents } from "./storage/documents.js";
import { StorageError } from "./storage/errors.js";
import type { StorageAdapter } from "./storage/types.js";
import { destinationFromPath, uploadRequestSchema } from "./storage/types.js";
import {
  TenderAccessError,
  TenderDraftConflictError,
  TenderDraftService,
  TenderDraftValidationError,
  tenderConfigInputSchema,
  tenderDraftInputSchema,
} from "./tenders/drafts.js";

export type ApiAppOptions = {
  storage: StorageAdapter;
  resolvePrincipal: PrincipalResolver;
};

const TEMPLATE_DESTINATION_KEY = "documents/templates";
const templateIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const templateVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const templateKindSchema = z.enum(["customer-bidding", "express-price"]);

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

  const tenderDrafts = new TenderDraftService(new Documents(options.storage));

  app.get("/api/tenders/:tenderId/templates", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const tenderId = parseParam(request, "tenderId", templateIdSchema);
    if (!tenderId)
      return sendInvalid(reply, "The tender identifier is invalid.");
    try {
      return await tenderDrafts.getTemplates(principal, tenderId);
    } catch (error) {
      return sendTenderError(reply, error);
    }
  });

  app.get("/api/tenders/:tenderId/draft", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const tenderId = parseParam(request, "tenderId", templateIdSchema);
    if (!tenderId)
      return sendInvalid(reply, "The tender identifier is invalid.");
    const query = request.query as Record<string, unknown>;
    const templateId = templateKindSchema.safeParse(query.templateId);
    if (!templateId.success)
      return sendInvalid(reply, "The workbook identifier is invalid.");
    try {
      return await tenderDrafts.getDraft(principal, tenderId, templateId.data);
    } catch (error) {
      return sendTenderError(reply, error);
    }
  });

  app.put("/api/tenders/:tenderId/draft", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const tenderId = parseParam(request, "tenderId", templateIdSchema);
    if (!tenderId)
      return sendInvalid(reply, "The tender identifier is invalid.");
    const parsed = tenderDraftInputSchema.safeParse(request.body);
    if (!parsed.success) return sendInvalid(reply, parsed.error.message);
    const ifMatch = request.headers["if-match"];
    const headerRevision =
      typeof ifMatch === "string"
        ? /^"?(\d+)"?$/.exec(ifMatch)?.[1]
        : undefined;
    const draftInput =
      parsed.data.expectedRevision === undefined && headerRevision !== undefined
        ? { ...parsed.data, expectedRevision: Number(headerRevision) }
        : parsed.data;
    try {
      return await tenderDrafts.saveDraftForTender(
        principal,
        tenderId,
        draftInput,
      );
    } catch (error) {
      return sendTenderError(reply, error);
    }
  });

  app.put("/api/tenders/:tenderId/config", async (request, reply) => {
    const principal = await requirePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    const tenderId = parseParam(request, "tenderId", templateIdSchema);
    if (!tenderId)
      return sendInvalid(reply, "The tender identifier is invalid.");
    const parsed = tenderConfigInputSchema.safeParse(request.body);
    if (!parsed.success) return sendInvalid(reply, parsed.error.message);
    try {
      return await tenderDrafts.configure(principal, tenderId, parsed.data);
    } catch (error) {
      return sendTenderError(reply, error);
    }
  });

  app.get("/api/documents/templates", async (request, reply) => {
    const principal = await requireTemplatePrincipal(
      options.resolvePrincipal,
      request,
      reply,
    );
    if (!principal) return;
    return {
      items: listTemplateVersions().map((template) => ({
        id: template.id,
        kind: template.kind,
        version: template.version,
        title: template.title,
        mappingStatus: template.mappingStatus,
        immutable: template.immutable,
        source: template.source,
        worksheetCount: template.workbook.worksheetCount,
        blankContract: template.blankContract,
      })),
    };
  });

  app.get(
    "/api/documents/templates/:templateId/versions/:version",
    async (request, reply) => {
      const principal = await requireTemplatePrincipal(
        options.resolvePrincipal,
        request,
        reply,
      );
      if (!principal) return;
      const params = request.params as Record<string, unknown>;
      const parsedId = templateIdSchema.safeParse(params.templateId);
      const parsedVersion = templateVersionSchema.safeParse(params.version);
      if (!parsedId.success || !parsedVersion.success) {
        return reply.code(400).send({
          error: "invalid_template_reference",
          message: "The template reference is invalid.",
        });
      }
      const template = findTemplateVersion(parsedId.data, parsedVersion.data);
      if (!template) {
        return reply.code(404).send({
          error: "template_not_found",
          message: "The requested template version is not registered.",
        });
      }
      return template;
    },
  );

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

async function requireTemplatePrincipal(
  resolvePrincipal: PrincipalResolver,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Awaited<ReturnType<PrincipalResolver>> | null> {
  const principal = await resolvePrincipal(request);
  if (!principal) {
    reply.code(401).send({
      error: "unauthenticated",
      message: "Sign in is required to view document templates.",
    });
    return null;
  }
  if (principal.role !== "staff") {
    reply.code(403).send({
      error: "forbidden",
      message: "Only administrators can view document templates.",
    });
    return null;
  }
  const hasDestinationAccess =
    principal.allowedDestinationKeys.includes("*") ||
    principal.allowedDestinationKeys.includes(TEMPLATE_DESTINATION_KEY);
  if (!principal.permissions.readTemplates || !hasDestinationAccess) {
    reply.code(403).send({
      error: "forbidden",
      message: "You do not have access to document templates.",
    });
    return null;
  }
  return principal;
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

function sendTenderError(reply: FastifyReply, error: unknown) {
  if (error instanceof TenderDraftValidationError) {
    return reply.code(400).send({
      error: "invalid_draft",
      message: error.message,
      fields: error.errors,
    });
  }
  if (error instanceof TenderDraftConflictError) {
    return reply.code(409).send({ error: "conflict", message: error.message });
  }
  if (error instanceof TenderAccessError) {
    return reply.code(403).send({ error: "forbidden", message: error.message });
  }
  if (error instanceof StorageError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  throw error;
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
