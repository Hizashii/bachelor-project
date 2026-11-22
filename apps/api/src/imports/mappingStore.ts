// Remembers how a carrier's spreadsheet columns map to the standard shipment fields.
// A mapping belongs to a column layout (its header names) and is saved as a new numbered
// version each time it changes. Saved versions are never overwritten.
// Not for guessing mappings: see packages/shared/src/shipments/headers.ts.

import { createHash } from "node:crypto";
import {
  type ColumnMapping,
  columnMappingSchema,
  normaliseHeader,
} from "@freight-desk/shared";
import { z } from "zod";
import type { AccessContext } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";

const FINGERPRINT_LENGTH = 16;
const DESTINATION = { kind: "import-mappings" } as const;

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
  private readonly documents: Documents;

  constructor(documents: Documents) {
    this.documents = documents;
  }

  async latest(
    context: AccessContext,
    headers: readonly string[],
  ): Promise<SavedMapping | null> {
    const prefix = `${layoutFingerprint(headers)}-v`;
    const files = await this.documents.list(context, DESTINATION, prefix);
    const versions = await Promise.all(
      files.map(async (file) =>
        savedMappingSchema.parse(
          await this.documents.readJson(context, file.id),
        ),
      ),
    );
    return versions.sort((a, b) => b.version - a.version)[0] ?? null;
  }

  // Two people saving at once collide on the file name; the second gets a conflict.
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
    await this.documents.putJson(
      context,
      DESTINATION,
      `${fingerprint}-v${saved.version}.json`,
      saved,
    );
    return saved;
  }
}
