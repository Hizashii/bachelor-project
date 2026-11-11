// This file turns on the security layers and adds the readiness and audit-read endpoints.
// Every route here needs config.action or config.public.

import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { installSecurityHeaders } from "../security/headers.ts";
import { installOriginCheck } from "../security/originCheck.ts";
import { installRateLimits } from "../security/rateLimit.ts";
import { registerAuditRoutes } from "./auditRoutes.ts";

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}

export function registerHardeningRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): void {
  installSecurityHeaders(app);
  installOriginCheck(app, allowedOrigins());
  installRateLimits(app);
  registerAuditRoutes(app, deps);

  app.get("/api/ready", { config: { public: true } }, async () => {
    try {
      await deps.store.list("audit");
    } catch {
      throw new AppError("UNAVAILABLE", "The file library is not reachable.");
    }
    return { ready: true };
  });
}
