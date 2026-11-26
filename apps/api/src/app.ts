import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { registerAdminRoutes } from "./auth/adminRoutes.ts";
import {
  requireAuth,
  requireCsrfOnWrites,
  requireRole,
} from "./auth/authorization.ts";
import { accessContextOf, principalOf } from "./auth/principal.ts";
import { registerAuthRoutes } from "./auth/routes.ts";
import { AuthError, AuthService } from "./auth/service.ts";
import { SessionStore } from "./auth/sessions.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { Accounts } from "./db/accounts.ts";
import { CredentialStore } from "./db/credentials.ts";
import type { Database } from "./db/pool.ts";
import { registerFreightRoutes } from "./freight/routes.ts";
import { createFreightServices } from "./freight/services.ts";
import { serializeApiError } from "./http/errors.ts";
import { registerStaticApp } from "./http/staticApp.ts";
import { StorageError } from "./storage/errors.ts";
import { PrincipalDocuments } from "./storage/principalDocuments.ts";
import { registerFileRoutes } from "./storage/routes.ts";
import type { StorageAdapter } from "./storage/types.ts";
import { registerTenderDraftRoutes } from "./tenders/draftRoutes.ts";

export type BuildApiOptions = {
  environment?: ApiEnvironment;
  // Accounts, sessions and roles live here. Freight data never does.
  database: Database;
  storage?: StorageAdapter;
};

const HSTS_SECONDS = 31_536_000;
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const APP_FILES = fileURLToPath(new URL("../../app/dist", import.meta.url));

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const environment = options.environment ?? loadApiEnvironment();
  const accounts = new Accounts(options.database);
  const credentials = new CredentialStore(options.database);
  const authService = new AuthService({
    environment,
    accounts,
    credentials,
    sessions: new SessionStore(options.database),
  });
  const server = Fastify({
    // URLs can contain one-time invitation or reset tokens, so never log request URLs.
    logger:
      environment.NODE_ENV !== "test"
        ? { redact: ["req.url", "req.headers.cookie"] }
        : false,
    bodyLimit: environment.MAX_UPLOAD_BYTES,
    trustProxy: environment.TRUST_PROXY,
  });

  server.register(cookie);
  server.register(rateLimit, {
    global: true,
    max: environment.REQUESTS_PER_MINUTE,
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
    if (!reply.hasHeader("Cache-Control")) {
      reply.header("Cache-Control", "no-store");
    }
    reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    if (environment.COOKIE_SECURE) {
      reply.header(
        "Strict-Transport-Security",
        `max-age=${HSTS_SECONDS}; includeSubDomains`,
      );
    }
    return payload;
  });

  server.get("/health", async () => ({
    status: "ok",
    service: "freight-desk-api",
  }));

  // Registered inside the server's plugin queue so the rate limits apply to these routes.
  server.register(async (scope) =>
    registerAuthRoutes(scope, { environment, authService }),
  );

  server.register(async (scope) => {
    scope.addHook("preHandler", requireAuth(authService));
    scope.addHook("preHandler", requireCsrfOnWrites(environment));
    if (options.storage) {
      const storage = options.storage;
      registerFileRoutes(scope, {
        storage,
        principalOf: (request) =>
          request.auth ? principalOf(accessContextOf(request.auth.user)) : null,
      });
      const freight = createFreightServices(storage, () =>
        accounts.activeCarriers(),
      );
      registerFreightRoutes(scope, freight);
      registerTenderDraftRoutes(
        scope,
        new PrincipalDocuments(storage),
        freight.bids,
      );
    }
    scope.register(async (admin) => {
      admin.addHook("preHandler", requireRole("master"));
      registerAdminRoutes(admin, {
        accounts,
        credentials,
        appOrigin: environment.APP_ORIGIN,
      });
    });
  });

  if (environment.NODE_ENV === "production" && existsSync(APP_FILES)) {
    registerStaticApp(server, APP_FILES);
  }

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found.",
    }),
  );

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message });
    }
    if (error instanceof StorageError) {
      if (error.retryAfterSeconds !== null) {
        reply.header("Retry-After", String(Math.ceil(error.retryAfterSeconds)));
      }
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "bad_request",
        message: "Some of the information is not valid.",
      });
    }
    const response = serializeApiError(error);
    return reply.code(response.statusCode).send(response.body);
  });

  return server;
}
