// Cloud-backed import drafts: the original file plus the column choices made so far, so
// a person can close the browser and continue later. Every save is a new numbered
// revision file; a discarded draft is marked, not deleted.
// A draft that was only downloaded is not a draft here: nothing was saved anywhere.

import { randomUUID } from "node:crypto";
import { columnMappingSchema } from "@freight-desk/shared";
import { z } from "zod";
import type { AccessContext } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import type { StoredFile } from "../storage/types.ts";

const DESTINATION = { kind: "import-drafts" } as const;

const draftSchema = z.object({
  draftId: z.string().uuid(),
  revision: z.number().int().positive(),
  status: z.enum(["open", "discarded"]),
  originalName: z.string(),
  originalFile: z.string(),
  mapping: columnMappingSchema,
  format: z.enum(["csv", "xlsx"]),
  savedAt: z.string(),
  savedBy: z.string(),
});

export type Draft = z.infer<typeof draftSchema>;

export type DraftInput = {
  draftId?: string;
  originalName: string;
  originalPath: string;
  extension: string;
  mapping: Draft["mapping"];
  format: Draft["format"];
};

const revisionOf = (file: StoredFile) =>
  Number(/-r(\d+)\.json$/.exec(file.name)?.[1] ?? 0);

export class DraftStore {
  private readonly documents: Documents;

  constructor(documents: Documents) {
    this.documents = documents;
  }

  private async latestFile(context: AccessContext, draftId: string) {
    const files = await this.documents.list(
      context,
      DESTINATION,
      `${draftId}-r`,
    );
    return files.sort((a, b) => revisionOf(b) - revisionOf(a))[0] ?? null;
  }

  // Saving again with the same draftId continues the same draft as a new revision.
  async save(context: AccessContext, input: DraftInput): Promise<Draft> {
    const draftId = input.draftId ?? randomUUID();
    const originalFile = `${draftId}-original${input.extension}`;
    const previous = input.draftId
      ? await this.latestFile(context, draftId)
      : null;
    if (!previous) {
      await this.documents.putFile(
        context,
        DESTINATION,
        originalFile,
        input.originalPath,
      );
    }
    const draft: Draft = {
      draftId,
      revision: previous ? revisionOf(previous) + 1 : 1,
      status: "open",
      originalName: input.originalName,
      originalFile,
      mapping: input.mapping,
      format: input.format,
      savedAt: new Date().toISOString(),
      savedBy: context.userId,
    };
    await this.documents.putJson(
      context,
      DESTINATION,
      `${draftId}-r${draft.revision}.json`,
      draft,
    );
    return draft;
  }

  async get(context: AccessContext, draftId: string): Promise<Draft | null> {
    const file = await this.latestFile(context, draftId);
    return file
      ? draftSchema.parse(await this.documents.readJson(context, file.id))
      : null;
  }

  async list(context: AccessContext): Promise<Draft[]> {
    const files = await this.documents.list(context, DESTINATION);
    const latest = new Map<string, StoredFile>();
    for (const file of files.filter((item) => item.name.endsWith(".json"))) {
      const draftId = file.name.split("-r")[0] ?? "";
      const current = latest.get(draftId);
      if (!current || revisionOf(file) > revisionOf(current)) {
        latest.set(draftId, file);
      }
    }
    const drafts = await Promise.all(
      [...latest.values()].map(async (file) =>
        draftSchema.parse(await this.documents.readJson(context, file.id)),
      ),
    );
    return drafts.filter((draft) => draft.status === "open");
  }

  async downloadOriginal(
    context: AccessContext,
    draft: Draft,
    localPath: string,
  ): Promise<void> {
    const files = await this.documents.list(
      context,
      DESTINATION,
      draft.originalFile,
    );
    const original = files[0];
    if (original) {
      await this.documents.readFile(context, original.id, localPath);
    }
  }

  async discard(context: AccessContext, draftId: string): Promise<boolean> {
    const draft = await this.get(context, draftId);
    if (!draft) return false;
    const next = {
      ...draft,
      status: "discarded" as const,
      revision: draft.revision + 1,
    };
    await this.documents.putJson(
      context,
      DESTINATION,
      `${draftId}-r${next.revision}.json`,
      next,
    );
    return true;
  }
}
