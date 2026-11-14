import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { requireAuth, requireCsrfOnWrites } from "./auth/authorization.ts";
import { createUserDirectory, type UserDirectory } from "./auth/directory.ts";
import {
  EntraIdentityProvider,
  type IdentityProvider,
} from "./auth/identity.ts";
import { accessContextOf, principalOf } from "./auth/principal.ts";
import { registerAuthRoutes } from "./auth/routes.ts";
import { AuthError, AuthService } from "./auth/service.ts";
import {
  type AuthTransactionStore,
  InMemoryAuthTransactionStore,
  InMemorySessionStore,
  type SessionStore,
} from "./auth/sessions.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { registerFreightRoutes } from "./freight/routes.ts";
import { createFreightServices } from "./freight/services.ts";
import { serializeApiError } from "./http/errors.ts";
import { StorageError } from "./storage/errors.ts";
import { registerFileRoutes } from "./storage/routes.ts";
import type { StorageAdapter } from "./storage/types.ts";

export type BuildApiOptions = {
  environment?: ApiEnvironment;
  directory?: UserDirectory;
  sessions?: SessionStore;
  transactions?: AuthTransactionStore;
  identityProvider?: IdentityProvider;
  storage?: StorageAdapter;
};

const REQUESTS_PER_MINUTE = 200;

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const environment = options.environment ?? loadApiEnvironment();
  const sessions =
    options.sessions ?? new InMemorySessionStore(environment.SESSION_SECRET);
  const identityProvider =
    options.identityProvider ??
    (environment.AUTH_MODE === "entra"
      ? new EntraIdentityProvider(environment)
      : undefined);
  const authService = new AuthService({
    environment,
    directory:
      options.directory ??
      createUserDirectory(environment.AUTHORIZED_USERS_JSON),
    sessions,
    identityProvider,
  });
  const server = Fastify({
    logger: environment.NODE_ENV !== "test",
    bodyLimit: environment.MAX_UPLOAD_BYTES,
  });

  server.register(cookie);
  server.register(rateLimit, {
    global: true,
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
    authMode: environment.AUTH_MODE,
  }));

  registerAuthRoutes(server, {
    environment,
    authService,
    transactions: options.transactions ?? new InMemoryAuthTransactionStore(),
    identityProvider,
  });

  if (options.storage) {
    const storage = options.storage;
    server.register(async (scope) => {
      scope.addHook("preHandler", requireAuth(authService));
      scope.addHook("preHandler", requireCsrfOnWrites(environment));
      registerFileRoutes(scope, {
        storage,
        principalOf: (request) =>
          request.auth ? principalOf(accessContextOf(request.auth.user)) : null,
      });
      registerFreightRoutes(scope, createFreightServices(storage));
    });
  }

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found.",
    }),
  );

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(error.statusCode).send({ error: error.code });
    }
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
