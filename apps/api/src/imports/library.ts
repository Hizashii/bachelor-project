// Saved column setups and cloud drafts for imports, on top of the open import sessions.
// Recognises a known file layout on upload and lets a person continue a draft later.
// Not for processing: see importService.ts.

import { join } from "node:path";
import type { ColumnMapping } from "@freight-desk/shared";
import type { AccessContext } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import { type Draft, DraftStore } from "./drafts.ts";
import type { ImportService } from "./importService.ts";
import { missingRequiredFields } from "./inspect.ts";
import { MappingStore } from "./mappingStore.ts";
import {
  createWorkspace,
  removeWorkspace,
  type Workspace,
} from "./tempFiles.ts";

export class DraftNotFoundError extends Error {}

type KnownTemplate = { name: string; version: number };

export class ImportLibrary {
  private readonly imports: ImportService;
  private readonly mappings: MappingStore;
  private readonly drafts: DraftStore;
  private readonly draftIds = new Map<string, string>();

  constructor(imports: ImportService, documents: Documents) {
    this.imports = imports;
    this.mappings = new MappingStore(documents);
    this.drafts = new DraftStore(documents);
  }

  // Opens an upload and prefers a saved column setup over the automatic guess.
  async openUpload(
    context: AccessContext,
    workspace: Workspace,
    fileName: string,
    receivedPath: string,
  ) {
    const opened = await this.imports.open(
      context,
      workspace,
      fileName,
      receivedPath,
    );
    const known = await this.mappings.latest(
      context,
      opened.inspection.headers,
    );
    if (!known)
      return { ...opened, knownTemplate: null as KnownTemplate | null };
    const inspection = {
      ...opened.inspection,
      mapping: known.mapping,
      uncertain: [],
      missingRequired: missingRequiredFields(known.mapping),
    };
    return {
      ...opened,
      inspection,
      knownTemplate: { name: known.name, version: known.version },
    };
  }

  rememberMapping(
    context: AccessContext,
    id: string,
    name: string,
    mapping: ColumnMapping,
  ) {
    this.imports.allow(context, "import:upload");
    const { headers } = this.imports.sourceOf(context, id);
    return this.mappings.save(context, headers, name, mapping);
  }

  saveDraft(
    context: AccessContext,
    id: string,
    mapping: ColumnMapping,
    format: Draft["format"],
  ): Promise<Draft> {
    this.imports.allow(context, "import:upload");
    const source = this.imports.sourceOf(context, id);
    return this.drafts
      .save(context, {
        draftId: this.draftIds.get(id),
        originalName: source.originalName,
        originalPath: source.inputPath,
        extension: `.${source.kind}`,
        mapping,
        format,
      })
      .then((draft) => {
        this.draftIds.set(id, draft.draftId);
        return draft;
      });
  }

  listDrafts(context: AccessContext) {
    this.imports.allow(context, "import:read");
    return this.drafts.list(context);
  }

  // Brings a draft back into a new session with the column choices it was saved with.
  async reopenDraft(context: AccessContext, draftId: string) {
    this.imports.allow(context, "import:upload");
    const draft = await this.drafts.get(context, draftId);
    if (draft?.status !== "open") throw new DraftNotFoundError();
    const workspace = await createWorkspace();
    const received = join(workspace.dir, "draft.tmp");
    try {
      await this.drafts.downloadOriginal(context, draft, received);
    } catch (error) {
      await removeWorkspace(workspace);
      throw error;
    }
    const opened = await this.imports.open(
      context,
      workspace,
      draft.originalName,
      received,
    );
    this.draftIds.set(opened.sessionId, draft.draftId);
    const inspection = {
      ...opened.inspection,
      mapping: draft.mapping,
      uncertain: [],
      missingRequired: missingRequiredFields(draft.mapping),
    };
    return { ...opened, inspection, format: draft.format };
  }

  async discardDraft(context: AccessContext, draftId: string): Promise<void> {
    this.imports.allow(context, "import:upload");
    if (!(await this.drafts.discard(context, draftId)))
      throw new DraftNotFoundError();
  }
}
