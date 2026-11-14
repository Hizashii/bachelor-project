// Remembers how a carrier's spreadsheet columns map to the standard shipment fields.
// A mapping belongs to a column layout (its header names), is saved as a new numbered
// version each time it changes, and is stored through the FileStore contract.
// Not for guessing mappings: see packages/shared/src/shipments/headers.ts.

import { createHash } from "node:crypto";
import {
  type ColumnMapping,
  columnMappingSchema,
  normaliseHeader,
} from "@freight-desk/shared";
import { z } from "zod";
import type { AccessContext } from "../contracts/access.ts";
import type { FileStore } from "../contracts/fileStore.ts";

const FINGERPRINT_LENGTH = 16;

const savedMappingSchema = z.object({
  fingerprint: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  mapping: columnMappingSchema,
  savedAt: z.string(),
  savedBy: z.string(),
});

export type SavedMapping = z.infer<typeof savedMappingSchema>;

// Two files with the same header names in the same order share a layout.
export function layoutFingerprint(headers: readonly string[]): string {
  const normalised = headers.map(normaliseHeader).join("|");
  return createHash("sha256")
    .update(normalised)
    .digest("hex")
    .slice(0, FINGERPRINT_LENGTH);
}

export class MappingStore {
  private readonly store: FileStore;

  constructor(store: FileStore) {
    this.store = store;
  }

  private folder(context: AccessContext, fingerprint: string): string {
    return `mappings/${context.organisationId}/${fingerprint}`;
  }

  async latest(
    context: AccessContext,
    headers: readonly string[],
  ): Promise<SavedMapping | null> {
    const fingerprint = layoutFingerprint(headers);
    const files = await this.store.list(
      context,
      this.folder(context, fingerprint),
    );
    const loaded = await Promise.all(
      files.map((file) => this.store.getJson(context, file.path)),
    );
    const versions = loaded.flatMap((file) =>
      file ? [savedMappingSchema.parse(file.value)] : [],
    );
    return versions.sort((a, b) => b.version - a.version)[0] ?? null;
  }

  async save(
    context: AccessContext,
    headers: readonly string[],
    name: string,
    mapping: ColumnMapping,
  ): Promise<SavedMapping> {
    const previous = await this.latest(context, headers);
    const fingerprint = layoutFingerprint(headers);
    const saved: SavedMapping = {
      fingerprint,
      version: (previous?.version ?? 0) + 1,
      name,
      mapping,
      savedAt: new Date().toISOString(),
      savedBy: context.userId,
    };
    const path = `${this.folder(context, fingerprint)}/v${saved.version}.json`;
    await this.store.putJson(context, path, saved);
    return saved;
  }
}
