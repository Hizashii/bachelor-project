// Sign-in routes: log in with e-mail and password, log out, accept an invitation, reset or
// change a password. Sessions are an opaque cookie; changes also need the CSRF token.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiEnvironment } from "../config/env.ts";
import { requireAuth, requireCsrf } from "./authorization.ts";
import { MAX_PASSWORD_LENGTH } from "./password.ts";
import { AuthError, type AuthService } from "./service.ts";

export type AuthRoutesOptions = {
  environment: ApiEnvironment;
  authService: AuthService;
};

const password = z.string().min(1).max(MAX_PASSWORD_LENGTH);
const loginBody = z
  .object({ email: z.string().trim().email().max(320), password })
  .strict();
const linkBody = z
  .object({ token: z.string().min(20).max(200), password })
  .strict();
const changeBody = z
  .object({ currentPassword: password, newPassword: password })
  .strict();

function cookieOptions(environment: ApiEnvironment, maxAge: number) {
  return {
    httpOnly: true,
    secure: environment.COOKIE_SECURE,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

// Requests from a browser carry an Origin header; one from another site is refused.
function assertSameOrigin(
  request: FastifyRequest,
  environment: ApiEnvironment,
) {
  const origin = request.headers.origin;
  if (origin !== new URL(environment.APP_ORIGIN).origin) {
    throw new AuthError(
      "csrf_failed",
      "The request failed CSRF validation.",
      403,
    );
  }
}

export function registerAuthRoutes(
  server: FastifyInstance,
  options: AuthRoutesOptions,
): void {
  const { environment, authService } = options;
  const limit = (max: number) => ({
    config: { rateLimit: { max, timeWindow: "1 minute" } },
  });

  server.post(
    "/auth/login",
    limit(environment.LOGIN_ATTEMPTS_PER_MINUTE),
    async (request, reply) => {
      assertSameOrigin(request, environment);
      const body = loginBody.parse(request.body);
      const session = await authService.login(body.email, body.password);
      const user = { ...session.user, storageMode: environment.STORAGE_MODE };
      return reply
        .setCookie(
          authService.sessionCookieName,
          session.cookieValue,
          cookieOptions(environment, environment.SESSION_TTL_SECONDS),
        )
        .send({ user });
    },
  );

  server.post(
    "/auth/accept-invitation",
    limit(environment.LOGIN_ATTEMPTS_PER_MINUTE),
    async (request) => {
      assertSameOrigin(request, environment);
      const body = linkBody.parse(request.body);
      await authService.setPasswordFromLink(
        body.token,
        "invitation",
        body.password,
      );
      return { ok: true };
    },
  );

  server.post(
    "/auth/reset-password",
    limit(environment.LOGIN_ATTEMPTS_PER_MINUTE),
    async (request) => {
      assertSameOrigin(request, environment);
      const body = linkBody.parse(request.body);
      await authService.setPasswordFromLink(
        body.token,
        "password_reset",
        body.password,
      );
      return { ok: true };
    },
  );

  server.post(
    "/auth/logout",
    { preHandler: [requireAuth(authService), requireCsrf(environment)] },
    async (request, reply) => {
      await authService.revokeSession(
        request.cookies[authService.sessionCookieName],
      );
      return reply
        .clearCookie(authService.sessionCookieName, { path: "/" })
        .send({
          redirectTo: new URL("/login", environment.APP_ORIGIN).toString(),
        });
    },
  );

  server.get(
    "/api/me",
    { preHandler: requireAuth(authService) },
    async (request) => ({
      user: request.auth
        ? { ...request.auth.user, storageMode: environment.STORAGE_MODE }
        : undefined,
    }),
  );

  server.get(
    "/api/csrf",
    { preHandler: requireAuth(authService) },
    async (request) => ({
      token: request.auth?.session.csrfToken,
    }),
  );

  // Changing the password ends every session, including this one.
  server.post(
    "/api/me/password",
    { preHandler: [requireAuth(authService), requireCsrf(environment)] },
    async (request, reply) => {
      const body = changeBody.parse(request.body);
      await authService.changePassword(
        request.auth?.user.id ?? "",
        body.currentPassword,
        body.newPassword,
      );
      return reply
        .clearCookie(authService.sessionCookieName, { path: "/" })
        .send({ ok: true });
    },
  );
}
