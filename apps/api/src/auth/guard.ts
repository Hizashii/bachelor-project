// This file protects every route in one place. A route must declare either
// config: { public: true } or config: { action: "<an Action from can.ts>" }.
// A route with neither refuses to register, so no route can skip the check.

import type { Principal } from "@freight-desk/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { type Action, can } from "./can.ts";
import { readSession, SESSION_COOKIE } from "./session.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    action?: Action;
    public?: boolean;
  }
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function requirePrincipal(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw new AppError("UNAUTHENTICATED", "Please sign in.");
  }
  return request.principal;
}

export function installGuard(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest("principal", null);

  app.addHook("onRoute", (route) => {
    const config = route.config ?? {};
    if (!config.public && !config.action) {
      throw new Error(`Route ${route.method} ${route.url} has no permission`);
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    const config = request.routeOptions.config;
    const session = readSession(
      request.cookies[SESSION_COOKIE],
      deps.config.sessionSecret,
      deps.clock.now(),
    );
    request.principal = session?.principal ?? null;
    if (session)
      reply.setCookie(SESSION_COOKIE, session.renewed, cookieOptions);
    if (config.public) return;
    if (!request.principal) {
      throw new AppError("UNAUTHENTICATED", "Please sign in.");
    }
    if (!config.action || !can(request.principal, config.action)) {
      await deps.audit.record({
        actor: request.principal.userId,
        role: request.principal.role,
        action: "access.denied",
        thing: request.routeOptions.url ?? "unknown",
        result: "denied",
      });
      throw new AppError("FORBIDDEN", "You cannot do that.");
    }
  });
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;
