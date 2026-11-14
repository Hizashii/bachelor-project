import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrincipalResolver } from "./auth.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { serializeApiError } from "./http/errors.ts";
import { StorageError } from "./storage/errors.ts";
import { registerFileRoutes } from "./storage/routes.ts";
import type { StorageAdapter } from "./storage/types.ts";

export type BuildApiOptions = {
  environment?: ApiEnvironment;
  storage?: StorageAdapter;
  resolvePrincipal?: PrincipalResolver;
};

const REQUESTS_PER_MINUTE = 120;

export async function buildApi(
  options: BuildApiOptions = {},
): Promise<FastifyInstance> {
  const environment = options.environment ?? loadApiEnvironment();
  const server = Fastify({
    logger: environment.NODE_ENV !== "test",
    bodyLimit: environment.MAX_UPLOAD_BYTES,
  });
  await server.register(cookie);
  await server.register(rateLimit, {
    max: REQUESTS_PER_MINUTE,
    timeWindow: "1 minute",
  });
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  server.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  server.get("/health", async () => ({
    status: "ok",
    service: "freight-desk-api",
  }));

  if (options.storage && options.resolvePrincipal) {
    registerFileRoutes(server, {
      storage: options.storage,
      resolvePrincipal: options.resolvePrincipal,
    });
  }

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found.",
    }),
  );

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof StorageError) {
      if (error.retryAfterSeconds !== null) {
        reply.header("Retry-After", String(Math.ceil(error.retryAfterSeconds)));
      }
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message });
    }
    const response = serializeApiError(error);
    return reply.code(response.statusCode).send(response.body);
  });

  return server;
}
