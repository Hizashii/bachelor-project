// This file registers the carrier offer-draft routes: read, save, check and preview.
// Every route needs config.action or config.public. Carrier and company come from the session.
import {
  type Principal,
  previewOffer,
  type Tender,
  validateOffer,
} from "@freight-desk/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePrincipal } from "../auth/guard.ts";
import type { AppDeps } from "../deps.ts";
import { AppError } from "../errors.ts";
import { parseInput } from "../http/validate.ts";
import { assertTenderAcceptsBids } from "../sealing/window.ts";
import { loadVisibleTender } from "../tenders/access.ts";
import { loadDraft, saveDraft } from "./draftRepository.ts";
import {
  buildDraft,
  EMPTY_CONTENT,
  offerContentSchema,
} from "./draftService.ts";

const BASE = "/api/carrier/tenders/:tenderId/offer-draft";
const paramsSchema = z.object({ tenderId: z.string().uuid() });
const EDIT = { config: { action: "bid:edit_own" } } as const;

type Scope = { principal: Principal; companyId: string; tenderId: string };

function scopeOf(request: FastifyRequest): Scope {
  const principal = requirePrincipal(request);
  const { tenderId } = parseInput(paramsSchema, request.params);
  if (!principal.carrierCompanyId) {
    throw new AppError("NOT_FOUND", "That tender was not found.");
  }
  return { principal, companyId: principal.carrierCompanyId, tenderId };
}

function tenderInfo(tender: Tender) {
  const { id, name, currency, deadlineUtc, status } = tender;
  return { id, name, currency, deadlineUtc, status };
}

async function readDraft(deps: AppDeps, request: FastifyRequest) {
  const scope = scopeOf(request);
  const tender = await loadVisibleTender(deps, scope.principal, scope.tenderId);
  const draft = await loadDraft(deps.store, scope.tenderId, scope.companyId);
  return { scope, tender, draft };
}

async function getDraft(deps: AppDeps, request: FastifyRequest) {
  const { scope, tender, draft } = await readDraft(deps, request);
  const info = tenderInfo(tender);
  if (draft) return { tender: info, draft: draft.data, etag: draft.etag };
  const { principal, tenderId } = scope;
  const empty = await buildDraft(
    deps,
    principal,
    tenderId,
    EMPTY_CONTENT,
    null,
  );
  return { tender: info, draft: empty, etag: null };
}

async function putDraft(deps: AppDeps, request: FastifyRequest) {
  const scope = scopeOf(request);
  await loadVisibleTender(deps, scope.principal, scope.tenderId);
  await assertTenderAcceptsBids(deps, scope.tenderId);
  const content = parseInput(offerContentSchema, request.body);
  const existing = await loadDraft(deps.store, scope.tenderId, scope.companyId);
  const ifMatch = request.headers["if-match"];
  if (existing && !ifMatch) {
    throw new AppError("PRECONDITION_FAILED", "The offer changed. Reload it.");
  }
  const { principal, tenderId } = scope;
  const bid = await buildDraft(
    deps,
    principal,
    tenderId,
    content,
    existing?.data ?? null,
  );
  const saved = await saveDraft(
    deps.store,
    bid,
    existing ? (ifMatch as string) : null,
  );
  await deps.audit.record({
    actor: principal.userId,
    role: "carrier",
    action: "offer.draft_saved",
    thing: `${tenderId}/${scope.companyId}`,
    result: "ok",
  });
  return { draft: bid, etag: saved.etag };
}

async function needDraft(deps: AppDeps, request: FastifyRequest) {
  const { tender, draft } = await readDraft(deps, request);
  if (!draft) throw new AppError("NOT_FOUND", "There is no draft offer yet.");
  return { tender, bid: draft.data };
}

export function registerOfferRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(BASE, EDIT, (request) => getDraft(deps, request));
  app.put(BASE, EDIT, (request) => putDraft(deps, request));
  app.post(`${BASE}/validate`, EDIT, async (request) => {
    const { tender, bid } = await needDraft(deps, request);
    return validateOffer(bid, tender.currency);
  });
  app.get(`${BASE}/preview`, EDIT, async (request) => {
    const { bid } = await needDraft(deps, request);
    return previewOffer(bid);
  });
}
