// This file registers sign-in helpers. dev-login exists only when config.devLogin is true.
// The Microsoft Entra sign-in is added later and calls issueSession the same way.

import { principalSchema } from "@freight-desk/shared";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps.ts";
import { parseInput } from "../http/validate.ts";
import { cookieOptions, requirePrincipal } from "./guard.ts";
import { issueSession, SESSION_COOKIE } from "./session.ts";

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/api/me", { config: { public: true } }, async (request) => {
    return { principal: request.principal };
  });

  app.get("/api/health", { config: { public: true } }, async () => ({
    ok: true,
  }));

  if (!deps.config.devLogin) return;
  app.post(
    "/auth/dev-login",
    { config: { public: true } },
    async (request, reply) => {
      const principal = parseInput(principalSchema, request.body);
      const cookie = issueSession(
        principal,
        deps.config.sessionSecret,
        deps.clock.now(),
      );
      reply.setCookie(SESSION_COOKIE, cookie, cookieOptions);
      return { principal };
    },
  );

  app.post(
    "/auth/logout",
    { config: { public: true } },
    async (request, reply) => {
      requirePrincipal(request);
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return { ok: true };
    },
  );
}
