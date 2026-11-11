// This file builds the Fastify server and wires every feature's routes.
// Dependencies are passed in so tests can use a fake file library and a fixed clock.

import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { installGuard } from "./auth/guard.ts";
import { registerAuthRoutes } from "./auth/routes.ts";
import { registerAwardRoutes } from "./awards/routes.ts";
import { registerBidRoutes } from "./bids/routes.ts";
import { registerCarrierTenderRoutes } from "./carrier/routes.ts";
import { registerComparisonRoutes } from "./comparison/routes.ts";
import type { AppDeps } from "./deps.ts";
import { registerExportRoutes } from "./exports/routes.ts";
import { registerHardeningRoutes } from "./hardening/routes.ts";
import { installErrorHandler } from "./http/errorHandler.ts";
import { registerImportRoutes } from "./imports/routes.ts";
import { registerInvitationRoutes } from "./invitations/routes.ts";
import { registerJobsRoutes } from "./jobs/routes.ts";
import { registerOfferRoutes } from "./offers/routes.ts";
import { registerSealingRoutes } from "./sealing/routes.ts";
import { registerTenderRoutes } from "./tenders/routes.ts";

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  installErrorHandler(app);
  installGuard(app, deps);
  registerAuthRoutes(app, deps);
  registerTenderRoutes(app, deps);
  registerInvitationRoutes(app, deps);
  registerCarrierTenderRoutes(app, deps);
  registerOfferRoutes(app, deps);
  registerImportRoutes(app, deps);
  registerSealingRoutes(app, deps);
  registerBidRoutes(app, deps);
  registerComparisonRoutes(app, deps);
  registerAwardRoutes(app, deps);
  registerExportRoutes(app, deps);
  registerJobsRoutes(app, deps);
  registerHardeningRoutes(app, deps);
  return app;
}
