// HTTP routes for price-template bindings, bid drafts and the template registry.
// Access rules live in TenderDraftService; these routes only parse input and map errors.

import {
  findTemplateVersion,
  listTemplateVersions,
} from "@freight-desk/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { accessContextOf, tenderDraftPrincipalOf } from "../auth/principal.ts";
import type { AuthenticatedUser } from "../auth/types.ts";
import { StorageError } from "../storage/errors.ts";
import type { PrincipalDocuments } from "../storage/principalDocuments.ts";
import type { Principal } from "../storage/types.ts";
import {
  BidAccessError,
  type BidService,
  BidStateError,
} from "./bidService.ts";
import { draftToPriceTemplate } from "./draftPriceTemplate.ts";
import {
  TenderAccessError,
  TenderDraftConflictError,
  TenderDraftService,
  TenderDraftValidationError,
  tenderConfigInputSchema,
  tenderDraftInputSchema,
} from "./drafts.ts";
import { PriceTemplateWorkbookError } from "./priceTemplateExcel.ts";

const TEMPLATE_DESTINATION_KEY = "documents/templates";
const tenderParams = z.object({
  tenderId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
});
const templateParams = z.object({
  templateId: tenderParams.shape.tenderId,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
const draftQuery = z.object({
  templateId: z.enum(["customer-bidding", "express-price"]),
});

type Handler<T> = (
  principal: Principal,
  request: FastifyRequest,
  user: AuthenticatedUser,
) => Promise<T> | T;

export function registerTenderDraftRoutes(
  app: FastifyInstance,
  documents: PrincipalDocuments,
  bids: BidService,
): void {
  const drafts = new TenderDraftService(documents);
  const guarded =
    <T>(handler: Handler<T>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth)
        return reply.code(401).send({ message: "Please sign in." });
      try {
        const { user } = request.auth;
        return await handler(tenderDraftPrincipalOf(user), request, user);
      } catch (error) {
        return sendError(reply, error);
      }
    };

  app.get(
    "/api/tenders/:tenderId/templates",
    guarded((principal, request) =>
      drafts.getTemplates(
        principal,
        tenderParams.parse(request.params).tenderId,
      ),
    ),
  );
  app.get(
    "/api/tenders/:tenderId/bid-draft",
    guarded((principal, request) =>
      drafts.getDraft(
        principal,
        tenderParams.parse(request.params).tenderId,
        draftQuery.parse(request.query).templateId,
      ),
    ),
  );
  app.put(
    "/api/tenders/:tenderId/bid-draft",
    guarded((principal, request) => {
      const body = tenderDraftInputSchema.parse(request.body);
      const header = /^"?(\d+)"?$/.exec(
        String(request.headers["if-match"] ?? ""),
      );
      const expectedRevision =
        body.expectedRevision ?? (header ? Number(header[1]) : undefined);
      return drafts.saveDraftForTender(
        principal,
        tenderParams.parse(request.params).tenderId,
        { ...body, expectedRevision },
      );
    }),
  );
  app.post(
    "/api/tenders/:tenderId/bid-draft/submit",
    guarded(async (principal, request, user) => {
      const tenderId = tenderParams.parse(request.params).tenderId;
      const context = accessContextOf(user);
      const draft = await drafts.getDraft(principal, tenderId, "express-price");
      const template = draftToPriceTemplate(
        draft.values,
        context.organisationId,
      );
      const bid = await bids.submitTemplate(context, tenderId, template);
      return { versionNumber: bid.versionNumber };
    }),
  );
  app.put(
    "/api/tenders/:tenderId/template-config",
    guarded((principal, request) =>
      drafts.configure(
        principal,
        tenderParams.parse(request.params).tenderId,
        tenderConfigInputSchema.parse(request.body),
      ),
    ),
  );
  registerTemplateRegistryRoutes(app, guarded);
}

function registerTemplateRegistryRoutes(
  app: FastifyInstance,
  guarded: (
    handler: Handler<unknown>,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
): void {
  app.get(
    "/api/documents/templates",
    guarded((principal) => {
      assertTemplateAccess(principal);
      return {
        items: listTemplateVersions().map((template) => ({
          id: template.id,
          kind: template.kind,
          version: template.version,
          title: template.title,
          mappingStatus: template.mappingStatus,
          immutable: template.immutable,
          source: template.source,
          worksheetCount: template.workbook.worksheetCount,
          blankContract: template.blankContract,
        })),
      };
    }),
  );
  app.get(
    "/api/documents/templates/:templateId/versions/:version",
    guarded((principal, request) => {
      assertTemplateAccess(principal);
      const { templateId, version } = templateParams.parse(request.params);
      const template = findTemplateVersion(templateId, version);
      if (!template) {
        throw new StorageError(
          "not_found",
          "The requested template version is not registered.",
        );
      }
      return template;
    }),
  );
}

function assertTemplateAccess(principal: Principal): void {
  const hasDestination =
    principal.allowedDestinationKeys.includes("*") ||
    principal.allowedDestinationKeys.includes(TEMPLATE_DESTINATION_KEY);
  if (
    principal.role !== "staff" ||
    !principal.permissions.readTemplates ||
    !hasDestination
  ) {
    throw new TenderAccessError(
      "You do not have access to document templates.",
    );
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply
      .code(400)
      .send({ error: "invalid_request", message: error.message });
  }
  if (error instanceof TenderDraftValidationError) {
    return reply.code(400).send({
      error: "invalid_draft",
      message: error.message,
      fields: error.errors,
    });
  }
  if (error instanceof TenderDraftConflictError) {
    return reply.code(409).send({ error: "conflict", message: error.message });
  }
  if (error instanceof PriceTemplateWorkbookError) {
    return reply
      .code(422)
      .send({ error: "invalid_bid", message: error.message });
  }
  if (error instanceof BidStateError) {
    return reply.code(409).send({ error: "closed", message: error.message });
  }
  if (error instanceof BidAccessError) {
    return reply.code(403).send({ error: "forbidden", message: error.message });
  }
  if (error instanceof TenderAccessError) {
    return reply.code(403).send({ error: "forbidden", message: error.message });
  }
  if (error instanceof StorageError) {
    return reply
      .code(error.statusCode)
      .send({ error: error.code, message: error.message });
  }
  throw error;
}
