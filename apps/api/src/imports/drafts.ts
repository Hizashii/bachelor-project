// Cloud-backed import drafts: the original file plus the column choices made so far, so
// a person can close the browser and continue later. A discarded draft is marked, not
// deleted, because data is archived rather than removed.
// A draft that was only downloaded is not a draft here: nothing was saved anywhere.

import { randomUUID } from "node:crypto";
import { columnMappingSchema } from "@freight-desk/shared";
import { z } from "zod";
import type { AccessContext } from "../contracts/access.ts";
import type { FileStore } from "../contracts/fileStore.ts";

const draftSchema = z.object({
  draftId: z.string().uuid(),
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

export class DraftStore {
  private readonly store: FileStore;

  constructor(store: FileStore) {
    this.store = store;
  }

  private folder(context: AccessContext, draftId: string): string {
    return `drafts/${context.organisationId}/${draftId}`;
  }

  // Saving again with the same draftId continues the same draft.
  async save(context: AccessContext, input: DraftInput): Promise<Draft> {
    const draftId = input.draftId ?? randomUUID();
    const folder = this.folder(context, draftId);
    const originalFile = `${folder}/original${input.extension}`;
    if (!input.draftId) {
      await this.store.putFile(context, originalFile, input.originalPath);
    }
    const draft: Draft = {
      draftId,
      status: "open",
      originalName: input.originalName,
      originalFile,
      mapping: input.mapping,
      format: input.format,
      savedAt: new Date().toISOString(),
      savedBy: context.userId,
    };
    const existing = await this.store.getJson(context, `${folder}/draft.json`);
    await this.store.putJson(
      context,
      `${folder}/draft.json`,
      draft,
      existing?.etag,
    );
    return draft;
  }

  async get(context: AccessContext, draftId: string): Promise<Draft | null> {
    const file = await this.store.getJson(
      context,
      `${this.folder(context, draftId)}/draft.json`,
    );
    return file ? draftSchema.parse(file.value) : null;
  }

  async list(context: AccessContext): Promise<Draft[]> {
    const files = await this.store.list(
      context,
      `drafts/${context.organisationId}`,
    );
    const records = await Promise.all(
      files
        .filter((file) => file.path.endsWith("/draft.json"))
        .map((file) => this.store.getJson(context, file.path)),
    );
    return records
      .flatMap((file) => (file ? [draftSchema.parse(file.value)] : []))
      .filter((draft) => draft.status === "open");
  }

  async downloadOriginal(
    context: AccessContext,
    draft: Draft,
    localPath: string,
  ): Promise<void> {
    await this.store.getFile(context, draft.originalFile, localPath);
  }

  async discard(context: AccessContext, draftId: string): Promise<boolean> {
    const path = `${this.folder(context, draftId)}/draft.json`;
    const file = await this.store.getJson(context, path);
    if (!file) return false;
    const draft = draftSchema.parse(file.value);
    await this.store.putJson(
      context,
      path,
      { ...draft, status: "discarded" },
      file.etag,
    );
    return true;
  }
}
