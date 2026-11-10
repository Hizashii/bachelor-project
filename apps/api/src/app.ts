import { randomBytes } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import {
  requireAuth,
  requireCompanyAccess,
  requireCsrf,
  requireRole,
} from "./auth/authorization.ts";
import {
  createUserDirectory,
  mockExternalIdentity,
  mockIdentityKeys,
  mockIdentityOptions,
  type UserDirectory,
} from "./auth/directory.ts";
import {
  createPkcePair,
  EntraIdentityProvider,
  type IdentityProvider,
} from "./auth/identity.ts";
import { AuthError, AuthService } from "./auth/service.ts";
import {
  AUTH_STATE_COOKIE,
  type AuthTransactionStore,
  InMemoryAuthTransactionStore,
  InMemorySessionStore,
  type SessionStore,
} from "./auth/sessions.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";

export type BuildApiOptions = {
  environment?: ApiEnvironment;
  directory?: UserDirectory;
  sessions?: SessionStore;
  transactions?: AuthTransactionStore;
  identityProvider?: IdentityProvider;
};

function cookieOptions(environment: ApiEnvironment, maxAge: number) {
  return {
    httpOnly: true,
    secure: environment.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function redirectToLogin(environment: ApiEnvironment, error?: string): string {
  const url = new URL("/login", environment.APP_ORIGIN);
  if (error) url.searchParams.set("error", error);
  return url.toString();
}

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const environment = options.environment ?? loadApiEnvironment();
  const directory =
    options.directory ?? createUserDirectory(environment.AUTHORIZED_USERS_JSON);
  const sessions =
    options.sessions ?? new InMemorySessionStore(environment.SESSION_SECRET);
  const transactions =
    options.transactions ?? new InMemoryAuthTransactionStore();
  const identityProvider =
    options.identityProvider ??
    (environment.AUTH_MODE === "entra"
      ? new EntraIdentityProvider(environment)
      : undefined);
  const authService = new AuthService({
    environment,
    directory,
    sessions,
    identityProvider,
  });
  const server = Fastify({ logger: false });

  server.register(cookie);
  server.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: "1 minute",
  });

  server.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  server.get("/health", async () => ({
    status: "ok",
    authMode: environment.AUTH_MODE,
  }));

  server.get("/api/auth/config", async () => ({
    mode: environment.AUTH_MODE,
    mockIdentities: environment.AUTH_MODE === "mock" ? mockIdentityOptions : [],
  }));

  server.get(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      if (environment.AUTH_MODE === "mock")
        return reply.redirect(redirectToLogin(environment));
      if (!identityProvider) {
        throw new AuthError(
          "auth_unavailable",
          "The identity provider is not configured.",
          503,
        );
      }

      const state = randomBytes(32).toString("base64url");
      const nonce = randomBytes(32).toString("base64url");
      const { verifier, challenge } = createPkcePair();
      await transactions.create({ state, nonce, codeVerifier: verifier }, 600);
      const authorizationUrl = await identityProvider.createAuthorizationUrl({
        state,
        nonce,
        codeChallenge: challenge,
      });

      return reply
        .setCookie(AUTH_STATE_COOKIE, state, cookieOptions(environment, 600))
        .redirect(authorizationUrl);
    },
  );

  server.get(
    "/auth/mock/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (environment.AUTH_MODE !== "mock") {
        throw new AuthError(
          "route_not_available",
          "Mock authentication is disabled.",
          404,
        );
      }

      const identity = (request.query as { identity?: string }).identity;
      if (
        !identity ||
        !mockIdentityKeys.includes(
          identity as (typeof mockIdentityKeys)[number],
        )
      ) {
        throw new AuthError(
          "invalid_mock_identity",
          "The requested mock identity is not available.",
          400,
        );
      }

      const session = await authService.createSession(
        mockExternalIdentity(identity as (typeof mockIdentityKeys)[number]),
      );
      return reply
        .setCookie(
          authService.sessionCookieName,
          session.cookieValue,
          cookieOptions(environment, environment.SESSION_TTL_SECONDS),
        )
        .redirect(environment.APP_ORIGIN);
    },
  );

  server.get("/auth/callback", async (request, reply) => {
    if (!identityProvider || environment.AUTH_MODE !== "entra") {
      throw new AuthError(
        "route_not_available",
        "Entra authentication is disabled.",
        404,
      );
    }

    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    if (query.error)
      return reply.redirect(redirectToLogin(environment, "entra_denied"));
    if (!query.code || !query.state) {
      throw new AuthError(
        "invalid_callback",
        "The sign-in callback is incomplete.",
        400,
      );
    }

    const stateCookie = request.cookies[AUTH_STATE_COOKIE];
    if (!stateCookie || stateCookie !== query.state) {
      throw new AuthError(
        "invalid_callback",
        "The sign-in state is invalid.",
        400,
      );
    }

    const transaction = await transactions.consume(query.state);
    if (!transaction) {
      throw new AuthError(
        "invalid_callback",
        "The sign-in state has expired.",
        400,
      );
    }

    try {
      const identity = await identityProvider.exchangeCode(
        query.code,
        transaction,
      );
      const session = await authService.createSession(identity);
      return reply
        .clearCookie(AUTH_STATE_COOKIE, { path: "/" })
        .setCookie(
          authService.sessionCookieName,
          session.cookieValue,
          cookieOptions(environment, environment.SESSION_TTL_SECONDS),
        )
        .redirect(environment.APP_ORIGIN);
    } catch (error) {
      const code =
        error instanceof AuthError && error.code === "mfa_required"
          ? "mfa_required"
          : "sign_in_failed";
      return reply.redirect(redirectToLogin(environment, code));
    }
  });

  server.get(
    "/api/me",
    { preHandler: requireAuth(authService) },
    async (request) => {
      if (!request.auth) {
        throw new AuthError(
          "unauthenticated",
          "Authentication is required.",
          401,
        );
      }
      return { user: request.auth.user };
    },
  );

  server.get(
    "/api/csrf",
    { preHandler: requireAuth(authService) },
    async (request) => {
      if (!request.auth) {
        throw new AuthError(
          "unauthenticated",
          "Authentication is required.",
          401,
        );
      }
      return { token: request.auth.session.csrfToken };
    },
  );

  server.post(
    "/auth/logout",
    { preHandler: [requireAuth(authService), requireCsrf(environment)] },
    async (request, reply) => {
      const cookieValue = request.cookies[authService.sessionCookieName];
      await authService.revokeSession(cookieValue);
      const redirectTo =
        environment.AUTH_MODE === "entra"
          ? (identityProvider?.createLogoutUrl() ??
            redirectToLogin(environment))
          : redirectToLogin(environment);
      return reply
        .clearCookie(authService.sessionCookieName, { path: "/" })
        .send({ redirectTo });
    },
  );

  // This route is intentionally data-free. It exercises the resource guard until domain APIs are added.
  server.get(
    "/api/companies/:companyId",
    { preHandler: [requireAuth(authService), requireCompanyAccess()] },
    async (request) => ({
      companyId: (request.params as { companyId: string }).companyId,
      authorized: true,
    }),
  );

  server.get(
    "/api/master/authorization-check",
    { preHandler: [requireAuth(authService), requireRole("master")] },
    async () => ({ authorized: true }),
  );

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError)
      return reply.code(error.statusCode).send({ error: error.code });
    return reply.code(500).send({ error: "internal_error" });
  });

  return server;
}
