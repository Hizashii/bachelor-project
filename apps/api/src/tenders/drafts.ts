import {
  findTemplateVersion,
  parseDecimalInput,
  type TemplateVersionBinding,
  templateVersionBindingSchema,
  verifiedTemplateView,
} from "@freight-desk/shared";
import { z } from "zod";
import { StorageError } from "../storage/errors.ts";
import type { PrincipalDocuments } from "../storage/principalDocuments.ts";
import type {
  Principal,
  StorageDestination,
  StoredFile,
} from "../storage/types.ts";

const tenderIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const revisionSchema = z.number().int().min(0);
const templateIdSchema = z.enum(["customer-bidding", "express-price"]);

export const tenderConfigInputSchema = z
  .object({
    ifMatch: z.string().regex(/^\d+$/).optional(),
    biddingTemplate: templateVersionBindingSchema.nullable().optional(),
    expressPriceTemplate: templateVersionBindingSchema.nullable().optional(),
    invitedCarrierIds: z.array(z.string().min(1).max(200)).max(500).optional(),
  })
  .strict();

export const tenderDraftInputSchema = z
  .object({
    templateId: templateIdSchema,
    templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sourceSha256: z.string().regex(/^[A-F0-9]{64}$/),
    expectedRevision: revisionSchema.optional(),
    ifMatch: z.string().regex(/^\d+$/).optional(),
    values: z.record(z.string().min(1).max(300), z.string().nullable()),
  })
  .strict();

export type TenderConfig = {
  tenderId: string;
  revision: number;
  organizationId: string;
  biddingTemplate: TemplateVersionBinding | null;
  expressPriceTemplate: TemplateVersionBinding | null;
  invitedCarrierIds: string[];
};

export type TenderDraft = {
  tenderId: string;
  templateId: "customer-bidding" | "express-price";
  templateVersion: string;
  sourceSha256: string;
  ownerUserId: string;
  ownerCarrierId: string | null;
  revision: number;
  values: Record<string, string | null>;
};

export class TenderAccessError extends Error {}
export class TenderDraftConflictError extends StorageError {
  constructor() {
    super(
      "conflict",
      "This tender draft changed in another session. Reload the latest draft before saving again.",
    );
  }
}

type TenderDocuments = {
  config: TenderConfig;
  configFile: StoredFile | null;
};

const CONFIG_PREFIX = "template-binding-r";
const DRAFT_PREFIX = "bid-draft-";

export class TenderDraftService {
  private readonly documents: PrincipalDocuments;

  constructor(documents: PrincipalDocuments) {
    this.documents = documents;
  }

  async getTemplates(principal: Principal, tenderId: string) {
    const config = await this.authorizedConfig(principal, tenderId, "read");
    const items = [
      this.templateItem(config.config.biddingTemplate),
      this.templateItem(config.config.expressPriceTemplate),
    ]
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) =>
        templateVisibleToPrincipal(principal, item.template.kind),
      );
    return {
      tenderId,
      configured: items.length > 0,
      nextStep:
        items.length > 0
          ? null
          : principal.role === "carrier"
            ? "No carrier-facing workbook is configured for this tender."
            : "A staff user must bind an approved workbook version in the tender setup before pricing can start.",
      items,
    };
  }

  async getDraft(
    principal: Principal,
    tenderId: string,
    templateId: "customer-bidding" | "express-price",
  ): Promise<{
    tenderId: string;
    template: ReturnType<typeof requireTemplate> | null;
    revision: number;
    values: Record<string, string | null>;
    etag: string;
  }> {
    const config = await this.authorizedConfig(principal, tenderId, "read");
    assertTemplateVisibleToPrincipal(principal, templateId);
    const binding = bindingFor(config.config, templateId);
    if (!binding) return this.emptyDraft(tenderId, templateId);
    const template = requireTemplate(binding);
    const files = await this.documents.list(
      principal,
      tenderDestination(tenderId),
      `${DRAFT_PREFIX}${tenderId}-`,
    );
    let latest: TenderDraft | null = null;
    let latestFile: StoredFile | null = null;
    for (const file of files) {
      const candidate = await this.readDraft(principal, file);
      if (
        !candidate ||
        candidate.tenderId !== tenderId ||
        candidate.templateId !== templateId ||
        candidate.ownerUserId !== principal.userId ||
        candidate.ownerCarrierId !== (principal.carrierId ?? null) ||
        candidate.templateVersion !== template.version ||
        candidate.sourceSha256 !== template.source.sha256
      ) {
        continue;
      }
      if (!latest || candidate.revision > latest.revision) {
        latest = candidate;
        latestFile = file;
      }
    }
    return {
      tenderId,
      template: template,
      revision: latest?.revision ?? 0,
      values: latest?.values ?? {},
      etag: latestFile?.eTag ?? String(latest?.revision ?? 0),
    };
  }

  async saveDraftForTender(
    principal: Principal,
    tenderId: string,
    input: z.infer<typeof tenderDraftInputSchema>,
  ) {
    const config = await this.authorizedConfig(principal, tenderId, "write");
    assertTemplateVisibleToPrincipal(principal, input.templateId);
    const binding = bindingFor(config.config, input.templateId);
    if (!binding || !sameBinding(binding, input)) {
      throw new StorageError(
        "invalid_request",
        "The selected workbook is not configured for this tender.",
      );
    }
    const template = requireTemplate(binding);
    const errors = validateDraftValues(
      input.templateId,
      template.version,
      input.values,
    );
    if (Object.keys(errors).length > 0) {
      throw new TenderDraftValidationError(errors);
    }
    const current = await this.getDraft(principal, tenderId, input.templateId);
    const expectedRevision =
      input.expectedRevision ??
      (input.ifMatch === undefined ? null : Number(input.ifMatch));
    if (expectedRevision === null) {
      throw new StorageError(
        "invalid_request",
        "A draft revision is required when saving a tender draft.",
      );
    }
    if (current.revision !== expectedRevision) {
      throw new TenderDraftConflictError();
    }
    const nextRevision = current.revision + 1;
    const draft: TenderDraft = {
      tenderId,
      templateId: input.templateId,
      templateVersion: template.version,
      sourceSha256: template.source.sha256,
      ownerUserId: principal.userId,
      ownerCarrierId: principal.carrierId ?? null,
      revision: nextRevision,
      values: normalizeValues(input.values),
    };
    try {
      const file = await this.documents.putJson(
        principal,
        tenderDestination(tenderId),
        `${DRAFT_PREFIX}${tenderId}-${ownerPart(principal.userId)}-r${nextRevision}.json`,
        draft,
      );
      return {
        tenderId,
        template,
        revision: nextRevision,
        values: draft.values,
        etag: file.eTag ?? String(nextRevision),
      };
    } catch (error) {
      if (error instanceof StorageError && error.code === "conflict") {
        throw new TenderDraftConflictError();
      }
      throw error;
    }
  }

  async configure(
    principal: Principal,
    tenderId: string,
    input: z.infer<typeof tenderConfigInputSchema>,
  ) {
    if (principal.role !== "staff") {
      throw new TenderAccessError("Only staff can configure tender templates.");
    }
    if (!principal.permissions.readTemplates) {
      throw new StorageError(
        "forbidden",
        "Template access is required to configure a tender workbook.",
      );
    }
    assertTenderDestination(principal, tenderId, "write");
    const current = await this.readConfig(principal, tenderId, true);
    const expected =
      input.ifMatch === undefined
        ? current.config.revision
        : Number(input.ifMatch);
    if (expected !== current.config.revision) {
      throw new TenderDraftConflictError();
    }
    const next: TenderConfig = {
      tenderId,
      revision: current.config.revision + 1,
      organizationId: principal.organizationId,
      biddingTemplate:
        input.biddingTemplate === undefined
          ? current.config.biddingTemplate
          : input.biddingTemplate,
      expressPriceTemplate:
        input.expressPriceTemplate === undefined
          ? current.config.expressPriceTemplate
          : input.expressPriceTemplate,
      invitedCarrierIds:
        input.invitedCarrierIds === undefined
          ? current.config.invitedCarrierIds
          : input.invitedCarrierIds,
    };
    for (const binding of [next.biddingTemplate, next.expressPriceTemplate]) {
      if (binding) requireTemplate(binding);
    }
    const file = await this.documents.putJson(
      principal,
      tenderDestination(tenderId),
      `${CONFIG_PREFIX}${next.revision}.json`,
      next,
    );
    return { config: next, etag: file.eTag ?? String(next.revision) };
  }

  private async authorizedConfig(
    principal: Principal,
    tenderId: string,
    action: "read" | "write",
  ): Promise<TenderDocuments> {
    if (principal.role !== "carrier" && principal.role !== "staff") {
      throw new TenderAccessError(
        "A carrier or staff role is required for tender access.",
      );
    }
    assertTenderDestination(principal, tenderId, action);
    const result = await this.readConfig(principal, tenderId, true);
    if (principal.role === "carrier") {
      const identity = principal.carrierId ?? principal.userId;
      if (!result.config.invitedCarrierIds.includes(identity)) {
        throw new TenderAccessError(
          "This carrier has not been invited to the tender.",
        );
      }
    }
    return result;
  }

  private async readConfig(
    principal: Principal,
    tenderId: string,
    shared: boolean,
  ): Promise<TenderDocuments> {
    const files = await (shared
      ? this.documents.listShared(
          principal,
          tenderDestination(tenderId),
          CONFIG_PREFIX,
        )
      : this.documents.list(
          principal,
          tenderDestination(tenderId),
          CONFIG_PREFIX,
        ));
    let latest: TenderDocuments = {
      config: emptyConfig(tenderId, principal.organizationId),
      configFile: null,
    };
    for (const file of files) {
      const candidate = await this.readConfigFile(principal, file);
      if (!candidate || candidate.tenderId !== tenderId) continue;
      if (candidate.revision > latest.config.revision) {
        latest = { config: candidate, configFile: file };
      }
    }
    if (
      latest.config.organizationId &&
      latest.config.organizationId !== principal.organizationId
    ) {
      throw new TenderAccessError(
        "This tender belongs to another organisation.",
      );
    }
    return latest;
  }

  private async readConfigFile(
    principal: Principal,
    file: StoredFile,
  ): Promise<TenderConfig | null> {
    try {
      const parsed = tenderConfigSchema.safeParse(
        await this.documents.readSharedJson(principal, file.id),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async readDraft(
    principal: Principal,
    file: StoredFile,
  ): Promise<TenderDraft | null> {
    try {
      const parsed = tenderDraftSchema.safeParse(
        await this.documents.readJson(principal, file.id),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private templateItem(binding: TemplateVersionBinding | null) {
    if (!binding) return null;
    const template = findTemplateVersion(
      binding.templateId,
      binding.templateVersion,
    );
    if (!template || template.source.sha256 !== binding.sourceSha256)
      return null;
    return { binding, template };
  }

  private emptyDraft(
    tenderId: string,
    templateId: "customer-bidding" | "express-price",
  ) {
    return {
      tenderId,
      template: null,
      revision: 0,
      values: {},
      etag: "0",
      templateId,
    };
  }
}

const tenderConfigSchema = z.object({
  tenderId: tenderIdSchema,
  revision: z.number().int().nonnegative(),
  organizationId: z.string().min(1),
  biddingTemplate: templateVersionBindingSchema.nullable(),
  expressPriceTemplate: templateVersionBindingSchema.nullable(),
  invitedCarrierIds: z.array(z.string().min(1)),
});

const tenderDraftSchema = z.object({
  tenderId: tenderIdSchema,
  templateId: templateIdSchema,
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  sourceSha256: z.string().regex(/^[A-F0-9]{64}$/),
  ownerUserId: z.string().min(1),
  ownerCarrierId: z.string().nullable(),
  revision: z.number().int().positive(),
  values: z.record(z.string(), z.string().nullable()),
});

export class TenderDraftValidationError extends Error {
  readonly errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super("Some tender draft values are invalid.");
    this.errors = errors;
  }
}

function emptyConfig(tenderId: string, organizationId: string): TenderConfig {
  return {
    tenderId,
    revision: 0,
    organizationId,
    biddingTemplate: null,
    expressPriceTemplate: null,
    invitedCarrierIds: [],
  };
}

function tenderDestination(tenderId: string): StorageDestination {
  const parsed = tenderIdSchema.safeParse(tenderId);
  if (!parsed.success)
    throw new StorageError(
      "invalid_request",
      "The tender identifier is invalid.",
    );
  return { kind: "tender", tenderId: parsed.data };
}

function assertTenderDestination(
  principal: Principal,
  tenderId: string,
  action: "read" | "write",
): void {
  if (action === "read" && !principal.permissions.readFiles) {
    throw new StorageError("forbidden", "You cannot view tender documents.");
  }
  if (action === "write" && !principal.permissions.uploadFiles) {
    throw new StorageError("forbidden", "You cannot save tender drafts.");
  }
  if (action === "write" && !principal.permissions.readFiles) {
    throw new StorageError(
      "forbidden",
      "You must be able to read the tender before saving a revision.",
    );
  }
  const key = `tenders/${tenderId}`;
  if (
    !principal.allowedDestinationKeys.includes("*") &&
    !principal.allowedDestinationKeys.includes(key)
  ) {
    throw new StorageError("forbidden", "You cannot access this tender.");
  }
}

function bindingFor(
  config: TenderConfig,
  templateId: "customer-bidding" | "express-price",
): TemplateVersionBinding | null {
  return templateId === "customer-bidding"
    ? config.biddingTemplate
    : config.expressPriceTemplate;
}

function templateVisibleToPrincipal(
  principal: Principal,
  templateId: "customer-bidding" | "express-price",
): boolean {
  return templateId === "express-price" || principal.role === "staff";
}

function assertTemplateVisibleToPrincipal(
  principal: Principal,
  templateId: "customer-bidding" | "express-price",
): void {
  if (!templateVisibleToPrincipal(principal, templateId)) {
    throw new TenderAccessError(
      "The customer bidding workbook is available to staff only.",
    );
  }
}

function requireTemplate(binding: TemplateVersionBinding) {
  const template = findTemplateVersion(
    binding.templateId,
    binding.templateVersion,
  );
  if (!template || template.source.sha256 !== binding.sourceSha256) {
    throw new StorageError(
      "invalid_request",
      "The workbook contract is not registered.",
    );
  }
  // Resolve the view now so a config can never point at a registry item without
  // a corresponding verified structural view.
  verifiedTemplateView(template.id);
  return template;
}

function sameBinding(
  binding: TemplateVersionBinding,
  input: z.infer<typeof tenderDraftInputSchema>,
): boolean {
  return (
    binding.templateId === input.templateId &&
    binding.templateVersion === input.templateVersion &&
    binding.sourceSha256 === input.sourceSha256
  );
}

function normalizeValues(
  values: Record<string, string | null>,
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value === null || value.trim() === "" ? null : value,
    ]),
  );
}

function validateDraftValues(
  templateId: "customer-bidding" | "express-price",
  templateVersion: string,
  values: Record<string, string | null>,
): Record<string, string> {
  const template = findTemplateVersion(templateId, templateVersion);
  if (!template)
    return { _template: "The workbook contract is not registered." };
  const view = verifiedTemplateView(templateId);
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value.trim() === "") continue;
    const cell = parseCellKey(key, templateId);
    if (
      !cell ||
      !editableCell(templateId, view.sheets, cell.sheet, cell.address)
    ) {
      errors[key] = "This workbook cell is read-only.";
      continue;
    }
    if (cell.address === "C7" || cell.address === "D7") continue;
    const parsed = parseDecimalInput(value, "da");
    const parsedEn = parseDecimalInput(value, "en");
    if (!parsed.ok && !parsedEn.ok) {
      errors[key] = "Enter a valid number using comma or dot decimals.";
    }
  }
  return errors;
}

function editableCell(
  templateId: "customer-bidding" | "express-price",
  sheets: ReturnType<typeof verifiedTemplateView>["sheets"],
  sheetName: string,
  address: string,
): boolean {
  if (
    templateId === "express-price" &&
    (address === "C7" || (sheetName !== "Total cost" && address === "D7"))
  )
    return true;
  const sheet = sheets.find((item) => item.name === sheetName);
  if (!sheet) return false;
  return sheet.sections.some((section) =>
    section.rows.some(
      (row) =>
        row.kind !== "total" &&
        section.columns.some(
          (column) =>
            column.sourceColumn &&
            `${column.sourceColumn}${row.sourceRow}` === address &&
            column.kind.startsWith("editable"),
        ),
    ),
  );
}

function parseCellKey(
  key: string,
  templateId: string,
): { sheet: string; address: string } | null {
  const prefix = `${templateId}|`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const separator = rest.lastIndexOf("|");
  if (separator <= 0) return null;
  const sheet = rest.slice(0, separator);
  const address = rest.slice(separator + 1);
  return /^[A-Z]+\d+$/.test(address) ? { sheet, address } : null;
}

function ownerPart(userId: string): string {
  return Buffer.from(userId, "utf8").toString("base64url");
}
