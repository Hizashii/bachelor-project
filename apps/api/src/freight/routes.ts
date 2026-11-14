// HTTP routes for file imports, carrier tariffs and shipment pricing.
// The sign-in layer supplies getContext(); a request without a context is refused.
// Each route only checks input, calls one use case and maps errors to plain messages.

import { createReadStream } from "node:fs";
import {
  columnMappingSchema,
  type PriceShipment,
  tariffSchema,
} from "@freight-desk/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AccessContext } from "../contracts/access.ts";
import { StorageConflictError } from "../contracts/fileStore.ts";
import {
  ImportAccessError,
  type ImportService,
  ImportStateError,
} from "../imports/importService.ts";
import { DraftNotFoundError, type ImportLibrary } from "../imports/library.ts";
import { MappingError } from "../imports/processShipments.ts";
import { UnreadableFileError } from "../imports/readRows.ts";
import { removeWorkspace, resolveDownload } from "../imports/tempFiles.ts";
import type { PricingService } from "../tariffs/pricing.ts";
import {
  TariffAccessError,
  type TariffService,
  TariffStateError,
} from "../tariffs/service.ts";
import { receiveUpload, UploadTooLargeError } from "./upload.ts";

export type FreightDependencies = {
  getContext: (request: FastifyRequest) => AccessContext | null;
  imports: ImportService;
  library: ImportLibrary;
  tariffs: TariffService;
  pricing: PricingService;
};

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
    weightKg: z.number().nonnegative().nullable(),
    pallets: z.number().nonnegative().nullable(),
    loadingMeters: z.number().nonnegative().nullable(),
    cubicMeters: z.number().nonnegative().nullable(),
  })
  .strict();
const compareBody = z
  .object({
    carriers: z
      .array(
        z.object({ organisationId: z.string(), tariffId: z.string() }).strict(),
      )
      .max(50),
    shipment: shipmentSchema,
  })
  .strict();

const FRIENDLY: [new (...args: never[]) => Error, number, string][] = [
  [ImportAccessError, 404, "We could not find that file."],
  [DraftNotFoundError, 404, "We could not find that draft."],
  [TariffAccessError, 403, "You do not have access to that."],
  [ImportStateError, 409, "The file is not ready for that yet."],
  [TariffStateError, 409, "That change is not allowed for this tariff."],
  [
    StorageConflictError,
    409,
    "Someone else changed this. Reload and try again.",
  ],
  [UnreadableFileError, 422, "We could not read that file. Use .xlsx or .csv."],
  [MappingError, 422, "Some required columns are not matched yet."],
  [UploadTooLargeError, 413, "That file is too large."],
  [z.ZodError, 400, "Some of the information is not valid."],
];

function fail(reply: FastifyReply, error: unknown) {
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
  app.addContentTypeParser(
    "application/octet-stream",
    (_request, payload, done) => done(null, payload),
  );

  const guarded =
    <T>(
      handler: (
        context: AccessContext,
        request: FastifyRequest,
        reply: FastifyReply,
      ) => Promise<T> | T,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = deps.getContext(request);
      if (!context) return reply.code(401).send({ message: "Please sign in." });
      try {
        return await handler(context, request, reply);
      } catch (error) {
        return fail(reply, error);
      }
    };

  registerImportRoutes(app, deps, guarded);
  registerTariffRoutes(app, deps, guarded);
}

type Guard = <T>(
  handler: (
    context: AccessContext,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<T> | T,
) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function registerImportRoutes(
  app: FastifyInstance,
  deps: FreightDependencies,
  guarded: Guard,
): void {
  const { imports, library } = deps;
  const idOf = (request: FastifyRequest) => idParams.parse(request.params).id;

  app.post(
    "/api/imports",
    { bodyLimit: Number.MAX_SAFE_INTEGER },
    guarded(async (context, request) => {
      const { name } = nameQuery.parse(request.query);
      const { workspace, path } = await receiveUpload(
        request.body as NodeJS.ReadableStream,
      );
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
    "/api/tariffs/:organisationId/:tariffId/versions",
    guarded((context, request) => {
      const { organisationId, tariffId } = versionParams
        .omit({ version: true })
        .parse(request.params);
      return tariffs.listVersions(context, organisationId, tariffId);
    }),
  );
  app.post(
    "/api/tariffs/import",
    { bodyLimit: Number.MAX_SAFE_INTEGER },
    guarded(async (context, request) => {
      nameQuery.parse(request.query);
      const { workspace, path } = await receiveUpload(
        request.body as NodeJS.ReadableStream,
      );
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
