// Tariff use cases: save drafts, submit, approve, activate and read versions.
// Every call is checked with the PermissionChecker and stored in the carrier's tariff
// folder in SharePoint. Each save is a new numbered revision file, so a published version
// is never overwritten and two editors cannot silently replace each other's work.
// Not for pricing shipments: see pricing.ts.

import {
  activate,
  isEditable,
  type Tariff,
  type TariffStatus,
  type TariffValidation,
  tariffSchema,
  transition,
  validateTariff,
} from "@freight-desk/shared";
import type {
  AccessContext,
  FreightAction,
  PermissionChecker,
} from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import type { StoredFile } from "../storage/types.ts";
import { readTariffGrid } from "./importGrid.ts";

export class TariffAccessError extends Error {}
export class TariffStateError extends Error {}

type Dependencies = { documents: Documents; permissions: PermissionChecker };

// The etag is the revision number the caller last saw.
export type SavedTariff = {
  tariff: Tariff;
  validation: TariffValidation;
  etag: string;
};

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const folderOf = (organisationId: string) =>
  ({ kind: "carrier-tariffs", carrierId: organisationId }) as const;

const versionPrefix = (tariffId: string, version: number) =>
  `${tariffId}-v${version}-r`;

const revisionOf = (file: StoredFile) =>
  Number(/-r(\d+)\.json$/.exec(file.name)?.[1] ?? 0);

export class TariffService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  private allow(
    context: AccessContext,
    action: FreightAction,
    carrierOrganisationId: string,
  ): void {
    const resource = { organisationId: carrierOrganisationId };
    if (!this.deps.permissions.can(context, action, resource)) {
      throw new TariffAccessError("Access denied.");
    }
  }

  assertCanEdit(context: AccessContext): void {
    this.allow(context, "tariff:edit", context.organisationId);
  }

  // Reads an uploaded rate sheet for the signed-in carrier. Nothing is saved yet.
  readGrid(context: AccessContext, localPath: string) {
    this.assertCanEdit(context);
    return readTariffGrid(localPath);
  }

  private async load(context: AccessContext, file: StoredFile) {
    const value = await this.deps.documents.readJson(context, file.id);
    return tariffSchema.parse(value);
  }

  // The tariffs that exist for each carrier company, for the comparison screen.
  async listCarrierTariffs(
    context: AccessContext,
    organisationIds: readonly string[],
  ): Promise<{ organisationId: string; tariffId: string }[]> {
    const found = await Promise.all(
      organisationIds.map(async (organisationId) => {
        this.allow(context, "tariff:read", organisationId);
        const files = await this.deps.documents.list(
          context,
          folderOf(organisationId),
        );
        const ids = new Set(
          files.map((file) => file.name.split("-v")[0] ?? ""),
        );
        return [...ids]
          .filter((tariffId) => SAFE_ID.test(tariffId))
          .map((tariffId) => ({ organisationId, tariffId }));
      }),
    );
    return found.flat();
  }

  async get(
    context: AccessContext,
    organisationId: string,
    tariffId: string,
    version: number,
  ): Promise<{ tariff: Tariff; etag: string } | null> {
    this.allow(context, "tariff:read", organisationId);
    if (!SAFE_ID.test(tariffId) || !SAFE_ID.test(organisationId)) return null;
    const files = await this.deps.documents.list(
      context,
      folderOf(organisationId),
      versionPrefix(tariffId, version),
    );
    const latest = files.sort((a, b) => revisionOf(b) - revisionOf(a))[0];
    return latest
      ? {
          tariff: await this.load(context, latest),
          etag: String(revisionOf(latest)),
        }
      : null;
  }

  async latestDraft(
    context: AccessContext,
  ): Promise<{ tariff: Tariff; etag: string } | null> {
    if (context.role !== "carrier") return null;
    const tariffs = await this.listCarrierTariffs(context, [
      context.organisationId,
    ]);
    for (const { tariffId } of tariffs) {
      const versions = await this.listVersions(
        context,
        context.organisationId,
        tariffId,
      );
      const draft = versions.find((tariff) => tariff.status === "draft");
      if (draft)
        return this.get(
          context,
          context.organisationId,
          tariffId,
          draft.version,
        );
    }
    return null;
  }

  async listVersions(
    context: AccessContext,
    organisationId: string,
    tariffId: string,
  ): Promise<Tariff[]> {
    this.allow(context, "tariff:read", organisationId);
    if (!SAFE_ID.test(tariffId) || !SAFE_ID.test(organisationId)) return [];
    const files = await this.deps.documents.list(
      context,
      folderOf(organisationId),
      `${tariffId}-v`,
    );
    const latest = new Map<string, StoredFile>();
    for (const file of files) {
      const key = file.name.replace(/-r\d+\.json$/, "");
      const current = latest.get(key);
      if (!current || revisionOf(file) > revisionOf(current)) {
        latest.set(key, file);
      }
    }
    return Promise.all(
      [...latest.values()].map((file) => this.load(context, file)),
    );
  }

  // Saves a draft. The caller passes the revision it last read; an older one is a conflict.
  async saveDraft(
    context: AccessContext,
    tariff: Tariff,
    ifMatch?: string,
  ): Promise<SavedTariff> {
    const parsed = tariffSchema.parse(tariff);
    this.allow(context, "tariff:edit", parsed.carrierOrganisationId);
    if (!isEditable(parsed)) {
      throw new TariffStateError("Only a draft can be edited.");
    }
    const existing = await this.get(
      context,
      parsed.carrierOrganisationId,
      parsed.tariffId,
      parsed.version,
    );
    if (existing && !isEditable(existing.tariff)) {
      throw new TariffStateError(
        "This version is already published. Start a new version.",
      );
    }
    if (existing && ifMatch !== existing.etag) {
      throw new StorageError("conflict", "Reload before saving again.");
    }
    const revision = Number(existing?.etag ?? 0) + 1;
    await this.write(context, parsed, revision);
    return {
      tariff: parsed,
      validation: validateTariff(parsed),
      etag: String(revision),
    };
  }

  async submit(context: AccessContext, tariff: Tariff): Promise<Tariff> {
    this.allow(context, "tariff:submit", tariff.carrierOrganisationId);
    const current = await this.current(context, tariff);
    if (!validateTariff(current.tariff).complete) {
      throw new TariffStateError("The tariff is not complete.");
    }
    return this.move(context, current, "submitted");
  }

  async approve(context: AccessContext, tariff: Tariff): Promise<Tariff> {
    this.allow(context, "tariff:approve", tariff.carrierOrganisationId);
    return this.move(context, await this.current(context, tariff), "approved");
  }

  async activateVersion(
    context: AccessContext,
    tariff: Tariff,
  ): Promise<Tariff> {
    this.allow(context, "tariff:approve", tariff.carrierOrganisationId);
    const current = await this.current(context, tariff);
    const versions = await this.listVersions(
      context,
      tariff.carrierOrganisationId,
      tariff.tariffId,
    );
    const changed = activate(
      current.tariff,
      versions,
      context.role,
      context.userId,
      new Date().toISOString(),
    );
    for (const item of changed) {
      const latest = await this.get(
        context,
        item.carrierOrganisationId,
        item.tariffId,
        item.version,
      );
      await this.write(context, item, Number(latest?.etag ?? 0) + 1);
    }
    return changed[0] as Tariff;
  }

  private async current(context: AccessContext, tariff: Tariff) {
    const found = await this.get(
      context,
      tariff.carrierOrganisationId,
      tariff.tariffId,
      tariff.version,
    );
    if (!found) throw new TariffStateError("Tariff version not found.");
    return found;
  }

  private async move(
    context: AccessContext,
    current: { tariff: Tariff; etag: string },
    to: TariffStatus,
  ): Promise<Tariff> {
    const next = transition(
      current.tariff,
      to,
      context.role,
      context.userId,
      new Date().toISOString(),
    );
    await this.write(context, next, Number(current.etag) + 1);
    return next;
  }

  private async write(
    context: AccessContext,
    tariff: Tariff,
    revision: number,
  ) {
    await this.deps.documents.putJson(
      context,
      folderOf(tariff.carrierOrganisationId),
      `${versionPrefix(tariff.tariffId, tariff.version)}${revision}.json`,
      tariff,
    );
  }
}
