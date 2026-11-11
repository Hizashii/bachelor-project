// This file registers the carrier tender routes: the list of invited tenders and one tender.
// The carrier company always comes from the session, never from the request.
import {
  type CarrierTender,
  carrierTenderFilterSchema,
  entityIdSchema,
} from "@freight-desk/shared";
import type { FastifyInstance } from "fastify";
import { requirePrincipal } from "../auth/guard.ts";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { parseInput } from "../http/validate.ts";
import { loadVisibleTender } from "../tenders/access.ts";
import { toCarrierTender } from "./tenderView.ts";

const CLOSED_STATUSES = ["closed", "awarded", "archived"];

function companyOf(principal: { carrierCompanyId: string | null }): string {
  if (!principal.carrierCompanyId) {
    throw new AppError("NOT_FOUND", "That tender was not found.");
  }
  return principal.carrierCompanyId;
}

async function tenderIds(deps: AppDeps): Promise<string[]> {
  return (await deps.store.list("tenders")).filter(
    (id) => entityIdSchema.safeParse(id).success,
  );
}

export function registerCarrierTenderRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): void {
  app.get(
    "/api/carrier/tenders",
    { config: { action: "tender:read_invited" } },
    async (request) => {
      const principal = requirePrincipal(request);
      const companyId = companyOf(principal);
      const { status } = parseInput(carrierTenderFilterSchema, request.query);
      const tenders: CarrierTender[] = [];
      for (const id of await tenderIds(deps)) {
        const tender = await visibleOrNull(deps, principal, id);
        if (!tender) continue;
        if (
          status &&
          CLOSED_STATUSES.includes(tender.status) !== (status === "closed")
        )
          continue;
        tenders.push(await toCarrierTender(deps, tender, companyId));
      }
      return { tenders };
    },
  );

  app.get<{ Params: { tenderId: string } }>(
    "/api/carrier/tenders/:tenderId",
    { config: { action: "tender:read_invited" } },
    async (request) => {
      const principal = requirePrincipal(request);
      const companyId = companyOf(principal);
      const tender = await loadVisibleTender(
        deps,
        principal,
        request.params.tenderId,
      );
      return toCarrierTender(deps, tender, companyId);
    },
  );
}

async function visibleOrNull(
  deps: AppDeps,
  principal: Parameters<typeof loadVisibleTender>[1],
  tenderId: string,
) {
  try {
    return await loadVisibleTender(deps, principal, tenderId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}
