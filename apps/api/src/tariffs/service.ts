// Tariff use cases: save drafts, submit, approve, activate and read versions.
// Every call is checked with the PermissionChecker contract and stored through the
// FileStore contract. A published version is never overwritten.
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
  ImportAction,
  PermissionChecker,
} from "../contracts/access.ts";
import type { FileStore } from "../contracts/fileStore.ts";
import { readTariffGrid } from "./importGrid.ts";

export class TariffAccessError extends Error {}
export class TariffStateError extends Error {}

type Dependencies = { store: FileStore; permissions: PermissionChecker };

export type SavedTariff = {
  tariff: Tariff;
  validation: TariffValidation;
  etag: string;
};

function pathOf(organisationId: string, tariffId: string, version: number) {
  return `tariffs/${organisationId}/${tariffId}/v${version}.json`;
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

export class TariffService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  private allow(
    context: AccessContext,
    action: ImportAction,
    carrierOrganisationId: string,
  ): void {
    const resource = { organisationId: carrierOrganisationId };
    if (!this.deps.permissions.can(context, action, resource)) {
      throw new TariffAccessError("Access denied.");
    }
  }

  // Reads an uploaded rate sheet for the signed-in carrier. Nothing is saved yet.
  readGrid(context: AccessContext, localPath: string) {
    this.allow(context, "tariff:edit", context.organisationId);
    return readTariffGrid(localPath);
  }

  async get(
    context: AccessContext,
    organisationId: string,
    tariffId: string,
    version: number,
  ): Promise<{ tariff: Tariff; etag: string } | null> {
    this.allow(context, "tariff:read", organisationId);
    if (!SAFE_ID.test(tariffId) || !SAFE_ID.test(organisationId)) return null;
    const file = await this.deps.store.getJson(
      context,
      pathOf(organisationId, tariffId, version),
    );
    return file
      ? { tariff: tariffSchema.parse(file.value), etag: file.etag }
      : null;
  }

  async listVersions(
    context: AccessContext,
    organisationId: string,
    tariffId: string,
  ): Promise<Tariff[]> {
    this.allow(context, "tariff:read", organisationId);
    if (!SAFE_ID.test(tariffId) || !SAFE_ID.test(organisationId)) return [];
    const folder = `tariffs/${organisationId}/${tariffId}`;
    const files = await this.deps.store.list(context, folder);
    const loaded = await Promise.all(
      files.map((file) => this.deps.store.getJson(context, file.path)),
    );
    return loaded.flatMap((file) =>
      file ? [tariffSchema.parse(file.value)] : [],
    );
  }

  // Saves a draft. The caller passes the ETag it last read so a second editor is not lost.
  async saveDraft(
    context: AccessContext,
    tariff: Tariff,
    ifMatch?: string,
  ): Promise<SavedTariff> {
    const parsed = tariffSchema.parse(tariff);
    this.allow(context, "tariff:edit", parsed.carrierOrganisationId);
    if (!SAFE_ID.test(parsed.tariffId))
      throw new TariffStateError("Invalid tariff id.");
    if (!isEditable(parsed))
      throw new TariffStateError("Only a draft can be edited.");
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
    const stored = await this.write(context, parsed, ifMatch ?? existing?.etag);
    return {
      tariff: parsed,
      validation: validateTariff(parsed),
      etag: stored.etag,
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
      const etag = (
        await this.get(
          context,
          item.carrierOrganisationId,
          item.tariffId,
          item.version,
        )
      )?.etag;
      await this.write(context, item, etag);
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
    await this.write(context, next, current.etag);
    return next;
  }

  private async write(
    context: AccessContext,
    tariff: Tariff,
    ifMatch?: string,
  ) {
    const path = pathOf(
      tariff.carrierOrganisationId,
      tariff.tariffId,
      tariff.version,
    );
    return this.deps.store.putJson(context, path, tariff, ifMatch);
  }
}
