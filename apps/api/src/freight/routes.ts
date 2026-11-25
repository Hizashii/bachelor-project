// HTTP routes for file imports, carrier tariffs and shipment pricing.
// The sign-in layer supplies getContext(); a request without a context is refused.
// Each route only checks input, calls one use case and maps errors to plain messages.

import { createReadStream } from "node:fs";
import {
  columnMappingSchema,
  type PriceShipment,
  priceTemplateShipmentSchema,
  tariffSchema,
  tenderDraftInputSchema,
  tenderStatusSchema,
} from "@freight-desk/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AccessContext } from "../auth/permissions.ts";
import { accessContextOf } from "../auth/principal.ts";
import {
  ImportAccessError,
  type ImportService,
  ImportStateError,
} from "../imports/importService.ts";
import { DraftNotFoundError, type ImportLibrary } from "../imports/library.ts";
import { MappingError } from "../imports/processShipments.ts";
import { UnreadableFileError } from "../imports/readRows.ts";
import {
  removeWorkspace,
  resolveDownload,
  sweepExpired,
} from "../imports/tempFiles.ts";
import { StorageError } from "../storage/errors.ts";
import type { PricingService } from "../tariffs/pricing.ts";
import {
  TariffAccessError,
  type TariffService,
  TariffStateError,
} from "../tariffs/service.ts";
import {
  BidAccessError,
  type BidService,
  BidStateError,
} from "../tenders/bidService.ts";
import { buildComparisonPdf, buildResultWorkbook } from "../tenders/exports.ts";
import {
  PriceTemplateWorkbookError,
  type PriceTemplateWorkbookInput,
} from "../tenders/priceTemplateExcel.ts";
import {
  TenderAccessError,
  TenderNotFoundError,
  type TenderService,
  TenderStateError,
} from "../tenders/service.ts";
import { readTemplateFile } from "../tenders/templateFiles.ts";
import { receiveUpload, UploadTooLargeError } from "./upload.ts";

export type FreightDependencies = {
  // The carrier companies that exist, with their names, for the comparison screen.
  listCarriers: () => Promise<{ organisationId: string; name: string }[]>;
  imports: ImportService;
  library: ImportLibrary;
  tariffs: TariffService;
  pricing: PricingService;
  tenders: TenderService;
  bids: BidService;
};

const SWEEP_EVERY_MS = 5 * 60_000;
const MAX_QUANTITY = 1_000_000;

const idSchema = z.string().uuid();
const idParams = z.object({ id: idSchema });
const processBody = z
  .object({ mapping: columnMappingSchema, format: z.enum(["csv", "xlsx"]) })
  .strict();
const previewBody = z.object({ mapping: columnMappingSchema }).strict();
const nameQuery = z.object({ name: z.string().min(1).max(200) });
const versionParams = z.object({
  organisationId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  tariffId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  version: z.coerce.number().int().positive(),
});
const shipmentSchema = z
  .object({
    originPostcode: z.string().nullable(),
    destinationPostcode: z.string().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weightKg: z.number().nonnegative().max(MAX_QUANTITY).nullable(),
    pallets: z.number().nonnegative().max(MAX_QUANTITY).nullable(),
    loadingMeters: z.number().nonnegative().max(MAX_QUANTITY).nullable(),
    cubicMeters: z.number().nonnegative().max(MAX_QUANTITY).nullable(),
  })
  .strict();
const compareBody = z
  .object({
    carriers: z
      .array(z.object({ organisationId: z.string() }).strict())
      .max(50),
    shipment: shipmentSchema,
  })
  .strict();
const tenderQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: tenderStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();
const tenderDraftBody = z.object({ draft: tenderDraftInputSchema }).strict();
const tenderUpdateBody = z
  .object({ draft: tenderDraftInputSchema, ifMatch: z.string().min(1) })
  .strict();
const tenderTransitionBody = z.object({ ifMatch: z.string().min(1) }).strict();
const tenderInvitationBody = z
  .object({
    carrierCompanyIds: z.array(z.string().uuid()).min(1).max(100),
    ifMatch: z.string().min(1),
  })
  .strict();
const tenderCompareBody = z
  .object({
    shipments: z.array(priceTemplateShipmentSchema).min(1).max(10_000),
  })
  .strict();

const FRIENDLY: [new (...args: never[]) => Error, number, string][] = [
  [ImportAccessError, 404, "We could not find that file."],
  [DraftNotFoundError, 404, "We could not find that draft."],
  [TariffAccessError, 403, "You do not have access to that."],
  [ImportStateError, 409, "The file is not ready for that yet."],
  [TariffStateError, 409, "That change is not allowed for this tariff."],
  [TenderAccessError, 403, "You do not have access to that tender."],
  [TenderNotFoundError, 404, "We could not find that tender."],
  [
    TenderStateError,
    409,
    "That tender cannot be changed in its current state.",
  ],
  [BidAccessError, 403, "You do not have access to that bid."],
  [BidStateError, 409, "That bid cannot be changed right now."],
  [
    PriceTemplateWorkbookError,
    422,
    "We could not read the carrier price template.",
  ],
  [UnreadableFileError, 422, "We could not read that file. Use .xlsx or .csv."],
  [MappingError, 422, "Some required columns are not matched yet."],
  [UploadTooLargeError, 413, "That file is too large."],
  [z.ZodError, 400, "Some of the information is not valid."],
];

const STORAGE_MESSAGES: Record<number, string> = {
  403: "You do not have access to that.",
  404: "We could not find that file.",
  409: "Someone else changed this. Reload and try again.",
  429: "Storage is busy. Please try again in a moment.",
};

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof StorageError) {
    const message =
      STORAGE_MESSAGES[error.statusCode] ??
      "Storage is not available right now.";
    return reply.code(error.statusCode).send({ message });
  }
  const match = FRIENDLY.find(([type]) => error instanceof type);
  const [, status, message] = match ?? [
    Error,
    500,
    "Something went wrong. Please try again.",
  ];
  return reply.code(status).send({ message });
}

export function registerFreightRoutes(
  app: FastifyInstance,
  deps: FreightDependencies,
): void {
  const sweep = setInterval(() => {
    void sweepExpired().catch(() => undefined);
  }, SWEEP_EVERY_MS);
  sweep.unref();
  app.addHook("onClose", async () => clearInterval(sweep));

  const guarded =
    <T>(
      handler: (
        context: AccessContext,
        request: FastifyRequest,
        reply: FastifyReply,
      ) => Promise<T> | T,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = request.auth ? accessContextOf(request.auth.user) : null;
      if (!context) return reply.code(401).send({ message: "Please sign in." });
      try {
        return await handler(context, request, reply);
      } catch (error) {
        return fail(reply, error);
      }
    };

  registerImportRoutes(app, deps, guarded);
  registerTenderRoutes(app, deps, guarded);
  registerTariffRoutes(app, deps, guarded);
}

type Guard = <T>(
  handler: (
    context: AccessContext,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<T> | T,
) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function registerTenderRoutes(
  app: FastifyInstance,
  deps: FreightDependencies,
  guarded: Guard,
): void {
  app.get(
    "/api/tenders",
    guarded((context, request) => {
      const query = tenderQuery.parse(request.query);
      return deps.tenders.list(context, {
        query: query.q,
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
    }),
  );
  app.get(
    "/api/tenders/:id",
    guarded((context, request) =>
      deps.tenders.get(context, idParams.parse(request.params).id),
    ),
  );
  app.get(
    "/api/tender-carriers",
    guarded(async (context) => {
      if (context.role === "carrier") return [];
      return deps.listCarriers();
    }),
  );
  app.post(
    "/api/tenders",
    guarded((context, request) =>
      deps.tenders.create(context, tenderDraftBody.parse(request.body).draft),
    ),
  );
  app.put(
    "/api/tenders/:id/draft",
    guarded((context, request) => {
      const body = tenderUpdateBody.parse(request.body);
      return deps.tenders.updateDraft(
        context,
        idParams.parse(request.params).id,
        body.draft,
        body.ifMatch,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/open",
    guarded((context, request) => {
      const body = tenderTransitionBody.parse(request.body);
      return deps.tenders.open(
        context,
        idParams.parse(request.params).id,
        body.ifMatch,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/close",
    guarded((context, request) => {
      const body = tenderTransitionBody.parse(request.body);
      return deps.tenders.close(
        context,
        idParams.parse(request.params).id,
        body.ifMatch,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/invitations",
    guarded((context, request) => {
      const body = tenderInvitationBody.parse(request.body);
      return deps.tenders.invite(
        context,
        idParams.parse(request.params).id,
        body.carrierCompanyIds,
        body.ifMatch,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/bids",
    guarded((context, request) => {
      if (!Buffer.isBuffer(request.body)) throw new z.ZodError([]);
      return deps.bids.submit(
        context,
        idParams.parse(request.params).id,
        request.body as unknown as PriceTemplateWorkbookInput,
      );
    }),
  );
  app.get(
    "/api/tenders/:id/bids",
    guarded((context, request) =>
      deps.bids.listSubmitted(context, idParams.parse(request.params).id),
    ),
  );
  app.post(
    "/api/tenders/:id/compare",
    guarded((context, request) => {
      const body = tenderCompareBody.parse(request.body);
      return deps.bids.compare(
        context,
        idParams.parse(request.params).id,
        body.shipments,
      );
    }),
  );
  app.get(
    "/api/tenders/:id/bid-template",
    guarded(async (context, request, reply) => {
      const id = idParams.parse(request.params).id;
      await deps.tenders.get(context, id);
      const workbook = await readTemplateFile("express-price");
      return sendDownload(
        reply,
        workbook,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `tender-${id}-price-template.xlsx`,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/export.xlsx",
    guarded(async (context, request, reply) => {
      const id = idParams.parse(request.params).id;
      const body = tenderCompareBody.parse(request.body);
      const comparison = await deps.bids.compare(context, id, body.shipments);
      const workbook = await buildResultWorkbook(comparison);
      return sendDownload(
        reply,
        workbook,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `tender-${id}-comparison.xlsx`,
      );
    }),
  );
  app.post(
    "/api/tenders/:id/export.pdf",
    guarded(async (context, request, reply) => {
      const id = idParams.parse(request.params).id;
      const body = tenderCompareBody.parse(request.body);
      const comparison = await deps.bids.compare(context, id, body.shipments);
      const pdf = await buildComparisonPdf(comparison);
      return sendDownload(
        reply,
        pdf,
        "application/pdf",
        `tender-${id}-comparison.pdf`,
      );
    }),
  );
}

function sendDownload(
  reply: FastifyReply,
  body: unknown,
  contentType: string,
  fileName: string,
): FastifyReply {
  return reply
    .type(contentType)
    .header("Content-Disposition", `attachment; filename="${fileName}"`)
    .send(body);
}

function registerImportRoutes(
  app: FastifyInstance,
  deps: FreightDependencies,
  guarded: Guard,
): void {
  const { imports, library } = deps;
  const idOf = (request: FastifyRequest) => idParams.parse(request.params).id;

  app.post(
    "/api/imports",

    guarded(async (context, request) => {
      const { name } = nameQuery.parse(request.query);
      const { workspace, path } = await receiveUpload(request.body as Buffer);
      return library.openUpload(context, workspace, name, path);
    }),
  );
  app.post(
    "/api/imports/:id/preview",
    guarded(async (context, request) =>
      imports.previewCleaning(
        context,
        idOf(request),
        previewBody.parse(request.body).mapping,
      ),
    ),
  );
  app.post(
    "/api/imports/:id/remember-mapping",
    guarded((context, request) => {
      const body = z
        .object({
          name: z.string().min(1).max(100),
          mapping: columnMappingSchema,
        })
        .strict()
        .parse(request.body);
      return library.rememberMapping(
        context,
        idOf(request),
        body.name,
        body.mapping,
      );
    }),
  );
  app.post(
    "/api/imports/:id/draft",
    guarded((context, request) => {
      const body = processBody.parse(request.body);
      return library.saveDraft(
        context,
        idOf(request),
        body.mapping,
        body.format,
      );
    }),
  );
  app.get(
    "/api/drafts",
    guarded((context) => library.listDrafts(context)),
  );
  app.post(
    "/api/drafts/:id/reopen",
    guarded((context, request) => library.reopenDraft(context, idOf(request))),
  );
  app.delete(
    "/api/drafts/:id",
    guarded(async (context, request) => {
      await library.discardDraft(context, idOf(request));
      return { ok: true };
    }),
  );
  app.post(
    "/api/imports/:id/process",
    guarded((context, request) => {
      const body = processBody.parse(request.body);
      return imports.start(context, idOf(request), body.mapping, body.format);
    }),
  );
  app.get(
    "/api/imports/:id/job",
    guarded((context, request) => imports.job(context, idOf(request))),
  );
  app.post(
    "/api/imports/:id/cancel",
    guarded((context, request) => imports.cancel(context, idOf(request))),
  );
  app.post(
    "/api/imports/:id/retry",
    guarded((context, request) => imports.retry(context, idOf(request))),
  );
  app.post(
    "/api/imports/:id/save",
    guarded((context, request) => imports.saveToCloud(context, idOf(request))),
  );
  app.post(
    "/api/imports/:id/download",
    guarded((context, request) => ({
      token: imports.download(context, idOf(request)),
    })),
  );
  app.delete(
    "/api/imports/:id",
    guarded(async (context, request) => {
      await imports.discard(context, idOf(request));
      return { ok: true };
    }),
  );
  app.get(
    "/api/downloads/:token",
    guarded((context, request, reply) => {
      const { token } = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(request.params);
      const file = resolveDownload(context, token);
      if (!file)
        return reply
          .code(404)
          .send({ message: "This download link has expired." });
      reply.header(
        "content-disposition",
        `attachment; filename="${file.fileName}"`,
      );
      reply.header("cache-control", "no-store");
      return reply.send(createReadStream(file.path));
    }),
  );
}

function registerTariffRoutes(
  app: FastifyInstance,
  deps: FreightDependencies,
  guarded: Guard,
): void {
  const { tariffs, pricing } = deps;
  const target = (request: FastifyRequest) =>
    versionParams.parse(request.params);
  const load = async (context: AccessContext, request: FastifyRequest) => {
    const { organisationId, tariffId, version } = target(request);
    const found = await tariffs.get(context, organisationId, tariffId, version);
    if (!found) throw new TariffStateError("Tariff version not found.");
    return found.tariff;
  };

  app.get(
    "/api/carriers",
    guarded(async (context) => {
      if (context.role === "carrier") return [];
      const carriers = await deps.listCarriers();
      const withTariffs = new Set(
        (
          await tariffs.listCarrierTariffs(
            context,
            carriers.map((carrier) => carrier.organisationId),
          )
        ).map((item) => item.organisationId),
      );
      return carriers.filter((carrier) =>
        withTariffs.has(carrier.organisationId),
      );
    }),
  );
  app.get(
    "/api/tariffs/:organisationId/:tariffId/versions",
    guarded((context, request) => {
      const { organisationId, tariffId } = versionParams
        .omit({ version: true })
        .parse(request.params);
      return tariffs.listVersions(context, organisationId, tariffId);
    }),
  );
  app.get(
    "/api/tariffs/mine",
    guarded((context) => deps.tariffs.latestDraft(context)),
  );
  app.post(
    "/api/tariffs/import",

    guarded(async (context, request) => {
      nameQuery.parse(request.query);
      tariffs.assertCanEdit(context);
      const { workspace, path } = await receiveUpload(request.body as Buffer);
      try {
        return await tariffs.readGrid(context, path);
      } finally {
        await removeWorkspace(workspace);
      }
    }),
  );
  app.put(
    "/api/tariffs",
    guarded((context, request) => {
      const body = z
        .object({ tariff: tariffSchema, ifMatch: z.string().optional() })
        .strict()
        .parse(request.body);
      return tariffs.saveDraft(context, body.tariff, body.ifMatch);
    }),
  );
  app.post(
    "/api/tariffs/:organisationId/:tariffId/:version/submit",
    guarded(async (c, r) => tariffs.submit(c, await load(c, r))),
  );
  app.post(
    "/api/tariffs/:organisationId/:tariffId/:version/approve",
    guarded(async (c, r) => tariffs.approve(c, await load(c, r))),
  );
  app.post(
    "/api/tariffs/:organisationId/:tariffId/:version/activate",
    guarded(async (c, r) => tariffs.activateVersion(c, await load(c, r))),
  );
  app.post(
    "/api/pricing/compare",
    guarded((context, request) => {
      const body = compareBody.parse(request.body);
      return pricing.priceCarriers(
        context,
        body.carriers,
        body.shipment satisfies PriceShipment,
      );
    }),
  );
}
