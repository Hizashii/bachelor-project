import { randomUUID } from "node:crypto";
import {
  entityIdSchema,
  type Tender,
  type TenderDraftInput,
  type TenderStatus,
  tenderDraftInputSchema,
  tenderSchema,
} from "@freight-desk/shared";
import type {
  AccessContext,
  FreightAction,
  PermissionChecker,
} from "../auth/permissions.ts";
import { CONSULTANCY_ORGANISATION_ID } from "../auth/principal.ts";
import type { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import type { StoredFile } from "../storage/types.ts";

export class TenderAccessError extends Error {}
export class TenderNotFoundError extends Error {}
export class TenderStateError extends Error {}

type Dependencies = { documents: Documents; permissions: PermissionChecker };
type TenderFile = { tender: Tender; file: StoredFile };

export type SavedTender = {
  tender: Tender;
  etag: string;
  fileId: string;
};

export type TenderListInput = {
  query?: string;
  status?: TenderStatus;
  limit: number;
  cursor?: number;
};

export type TenderList = {
  items: SavedTender[];
  total: number;
  nextCursor: number | null;
};

const TENDER_FILES = { kind: "tenders" } as const;
const FILE_PREFIX = "tender-";
const FILE_PATTERN = /^tender-([0-9a-f-]{36})-r(\d+)\.json$/i;

export class TenderService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  async list(
    context: AccessContext,
    input: TenderListInput,
  ): Promise<TenderList> {
    this.allow(context, "tender:read", {
      invitedCarrierCompanyIds: [context.organisationId],
    });
    const all = await this.latest(context);
    const visible = all
      .filter((record) => this.visible(context, record.tender))
      .filter((record) => this.matches(record.tender, input));
    visible.sort((left, right) =>
      right.tender.updatedAtUtc.localeCompare(left.tender.updatedAtUtc),
    );
    const start = input.cursor ?? 0;
    if (start > visible.length) {
      throw new StorageError(
        "invalid_request",
        "The tender cursor is invalid.",
      );
    }
    const items = visible.slice(start, start + input.limit).map(toSaved);
    const nextCursor =
      start + items.length < visible.length ? start + items.length : null;
    return { items, total: visible.length, nextCursor };
  }

  async get(context: AccessContext, id: string): Promise<SavedTender> {
    this.allow(context, "tender:read", {
      invitedCarrierCompanyIds: [context.organisationId],
    });
    const found = (await this.latest(context)).find(
      (record) => record.tender.id === id,
    );
    if (!found) throw new TenderNotFoundError("Tender not found.");
    if (!this.visible(context, found.tender)) {
      throw new TenderAccessError("Access denied.");
    }
    return toSaved(found);
  }

  async create(
    context: AccessContext,
    input: TenderDraftInput,
  ): Promise<SavedTender> {
    this.allow(context, "tender:create");
    const draft = tenderDraftInputSchema.parse(input);
    const now = new Date().toISOString();
    const tender = buildDraft(draft, context.userId, now);
    const file = await this.write(context, tender);
    return { tender, etag: String(tender.revision), fileId: file.id };
  }

  async updateDraft(
    context: AccessContext,
    id: string,
    input: TenderDraftInput,
    ifMatch: string,
  ): Promise<SavedTender> {
    this.allow(context, "tender:edit");
    const current = await this.get(context, id);
    if (current.tender.status !== "draft") {
      throw new TenderStateError("Only a draft can be edited.");
    }
    if (ifMatch !== current.etag) {
      throw new StorageError("conflict", "Reload before saving again.");
    }
    const draft = tenderDraftInputSchema.parse(input);
    const tender = mergeDraft(current.tender, draft);
    const file = await this.write(context, tender);
    return { tender, etag: String(tender.revision), fileId: file.id };
  }

  async open(
    context: AccessContext,
    id: string,
    ifMatch: string,
  ): Promise<SavedTender> {
    return this.transition(context, id, ifMatch, "draft", "open", {
      openedAtUtc: new Date().toISOString(),
    });
  }

  async close(
    context: AccessContext,
    id: string,
    ifMatch: string,
  ): Promise<SavedTender> {
    return this.transition(context, id, ifMatch, "open", "closed", {
      closedAtUtc: new Date().toISOString(),
    });
  }

  // Picks the winning carrier of a closed tender. The caller checks the carrier has bid.
  async award(
    context: AccessContext,
    id: string,
    ifMatch: string,
    winner: { carrierCompanyId: string; reason: string | null },
  ): Promise<SavedTender> {
    const current = await this.get(context, id);
    if (
      !current.tender.invitedCarrierCompanyIds.includes(winner.carrierCompanyId)
    ) {
      throw new TenderStateError("Only an invited carrier can win.");
    }
    return this.transition(context, id, ifMatch, "closed", "awarded", {
      awardedAtUtc: new Date().toISOString(),
      awardedCarrierCompanyId: winner.carrierCompanyId,
      awardReason: winner.reason,
    });
  }

  async invite(
    context: AccessContext,
    id: string,
    carrierCompanyIds: readonly string[],
    ifMatch: string,
  ): Promise<SavedTender> {
    this.allow(context, "tender:edit");
    const current = await this.get(context, id);
    if (!["draft", "open"].includes(current.tender.status)) {
      throw new TenderStateError("Only a draft or open tender can be invited.");
    }
    if (ifMatch !== current.etag) {
      throw new StorageError("conflict", "Reload before saving again.");
    }
    const ids = carrierCompanyIds.map((idValue) =>
      entityIdSchema.parse(idValue),
    );
    const tender = {
      ...current.tender,
      invitedCarrierCompanyIds: [
        ...new Set([...current.tender.invitedCarrierCompanyIds, ...ids]),
      ],
      revision: current.tender.revision + 1,
      updatedAtUtc: new Date().toISOString(),
    };
    const file = await this.write(context, tender);
    return { tender, etag: String(tender.revision), fileId: file.id };
  }

  private async transition(
    context: AccessContext,
    id: string,
    ifMatch: string,
    from: TenderStatus,
    status: TenderStatus,
    dates: Partial<
      Pick<
        Tender,
        | "openedAtUtc"
        | "closedAtUtc"
        | "awardedAtUtc"
        | "awardedCarrierCompanyId"
        | "awardReason"
      >
    >,
  ): Promise<SavedTender> {
    this.allow(context, "tender:edit");
    const current = await this.get(context, id);
    if (current.tender.status !== from) {
      throw new TenderStateError(`Only a ${from} tender can be changed.`);
    }
    if (ifMatch !== current.etag) {
      throw new StorageError("conflict", "Reload before saving again.");
    }
    const tender = {
      ...current.tender,
      ...dates,
      status,
      revision: current.tender.revision + 1,
      updatedAtUtc: new Date().toISOString(),
    };
    const file = await this.write(context, tender);
    return { tender, etag: String(tender.revision), fileId: file.id };
  }

  private allow(
    context: AccessContext,
    action: FreightAction,
    extra: { invitedCarrierCompanyIds?: readonly string[] } = {},
  ): void {
    const resource = {
      organisationId: CONSULTANCY_ORGANISATION_ID,
      ...extra,
    };
    if (!this.deps.permissions.can(context, action, resource)) {
      throw new TenderAccessError("Access denied.");
    }
  }

  private visible(context: AccessContext, tender: Tender): boolean {
    return (
      context.role !== "carrier" ||
      tender.invitedCarrierCompanyIds.includes(context.organisationId)
    );
  }

  private matches(tender: Tender, input: TenderListInput): boolean {
    if (input.status && tender.status !== input.status) return false;
    const query = input.query?.trim().toLocaleLowerCase();
    return (
      !query ||
      tender.name.toLocaleLowerCase().includes(query) ||
      tender.customerReference.toLocaleLowerCase().includes(query)
    );
  }

  private async latest(context: AccessContext): Promise<TenderFile[]> {
    const files = await this.deps.documents.list(
      context,
      TENDER_FILES,
      FILE_PREFIX,
    );
    const latest = new Map<string, TenderFile>();
    for (const file of files) {
      const match = FILE_PATTERN.exec(file.name);
      if (!match) continue;
      const tender = tenderSchema.parse(
        await this.deps.documents.readJson(context, file.id),
      );
      const current = latest.get(tender.id);
      if (!current || tender.revision > current.tender.revision) {
        latest.set(tender.id, { tender, file });
      }
    }
    return [...latest.values()];
  }

  private async write(
    context: AccessContext,
    tender: Tender,
  ): Promise<StoredFile> {
    return this.deps.documents.putJson(
      context,
      TENDER_FILES,
      `tender-${tender.id}-r${tender.revision}.json`,
      tender,
    );
  }
}

function buildDraft(
  input: TenderDraftInput,
  ownerUserId: string,
  now: string,
): Tender {
  return {
    id: randomUUID(),
    revision: 1,
    name: input.name,
    customerReference: input.customerReference,
    status: "draft",
    ownerUserId,
    deadlineUtc: input.deadlineUtc ?? null,
    displayTimeZone: input.displayTimeZone,
    currency: input.currency,
    vatTreatment: input.vatTreatment ?? null,
    vatRateBasisPoints: input.vatRateBasisPoints ?? null,
    zonePolicy: input.zonePolicy ?? null,
    evaluation: input.evaluation ?? null,
    shipmentTemplate: input.shipmentTemplate ?? null,
    carrierRateTemplate: input.carrierRateTemplate ?? null,
    shipmentBasis: input.shipmentBasis ?? null,
    invitedCarrierCompanyIds: [],
    createdAtUtc: now,
    updatedAtUtc: now,
    openedAtUtc: null,
    closedAtUtc: null,
    awardedAtUtc: null,
    awardedCarrierCompanyId: null,
    awardReason: null,
    archivedAtUtc: null,
  };
}

function mergeDraft(current: Tender, input: TenderDraftInput): Tender {
  return {
    ...current,
    ...input,
    deadlineUtc: input.deadlineUtc ?? null,
    vatTreatment: input.vatTreatment ?? null,
    vatRateBasisPoints: input.vatRateBasisPoints ?? null,
    zonePolicy: input.zonePolicy ?? null,
    evaluation: input.evaluation ?? null,
    shipmentTemplate: input.shipmentTemplate ?? null,
    carrierRateTemplate: input.carrierRateTemplate ?? null,
    shipmentBasis: input.shipmentBasis ?? null,
    revision: current.revision + 1,
    updatedAtUtc: new Date().toISOString(),
  };
}

function toSaved(record: TenderFile): SavedTender {
  return {
    tender: record.tender,
    etag: String(record.tender.revision),
    fileId: record.file.id,
  };
}
