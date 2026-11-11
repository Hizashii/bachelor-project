// This file registers the deadline and sealed-bid routes. Every route needs config.action.

import {
  type BidStatus,
  closeBodySchema,
  entityIdSchema,
  unsealBodySchema,
} from "@freight-desk/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePrincipal } from "../auth/guard.ts";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { parseInput } from "../http/validate.ts";
import { loadTender } from "../tenders/repository.ts";
import {
  bidsAreOpen,
  countInvited,
  countSubmittedBids,
  readSubmittedBids,
} from "./access.ts";
import { closeTender } from "./closing.ts";
import { unsealTender } from "./unseal.ts";

const paramsSchema = z.object({ tenderId: entityIdSchema });

const tenderIdOf = (request: FastifyRequest): string =>
  parseInput(paramsSchema, request.params).tenderId;

export function registerSealingRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    "/api/tenders/:tenderId/close",
    { config: { action: "tender:manage" } },
    async (request) => {
      parseInput(closeBodySchema, request.body);
      const principal = requirePrincipal(request);
      const tender = await closeTender(deps, tenderIdOf(request), {
        userId: principal.userId,
        role: principal.role === "master" ? "master" : "consultant",
      });
      return { status: tender.status, closedAtUtc: tender.closedAtUtc };
    },
  );

  app.post(
    "/api/tenders/:tenderId/unseal",
    { config: { action: "bid:unseal" } },
    async (request) => {
      const { reason } = parseInput(unsealBodySchema, request.body);
      await unsealTender(
        deps,
        requirePrincipal(request),
        tenderIdOf(request),
        reason,
      );
      return { opened: true };
    },
  );

  app.get(
    "/api/tenders/:tenderId/bids/status",
    { config: { action: "bid:read_opened" } },
    async (request): Promise<BidStatus> => {
      const tenderId = tenderIdOf(request);
      if (!(await loadTender(deps.store, tenderId))) {
        throw new AppError("NOT_FOUND", "That tender was not found.");
      }
      return {
        invited: await countInvited(deps, tenderId),
        submitted: await countSubmittedBids(deps, tenderId),
        opened: await bidsAreOpen(deps, tenderId),
      };
    },
  );

  app.get(
    "/api/tenders/:tenderId/bids",
    { config: { action: "bid:read_opened" } },
    async (request) => ({
      bids: await readSubmittedBids(
        deps,
        requirePrincipal(request),
        tenderIdOf(request),
      ),
    }),
  );
}
