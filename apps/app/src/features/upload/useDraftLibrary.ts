// Saved drafts and remembered column setups for the upload screen.
// A draft counts as saved only after the server has stored it in the cloud.

import { useEffect, useState } from "react";
import type { ColumnMapping, DraftSummary, OpenedImport } from "./types";
import * as api from "./uploadApi";

export type DraftState = "idle" | "saving" | "saved" | "failed";
type Run = (work: () => Promise<void>) => Promise<void>;
const SETUP_NAME_LENGTH = 100;

export function useDraftLibrary(
  sessionId: string | null,
  mapping: ColumnMapping,
  headers: string[],
  run: Run,
  accept: (opened: OpenedImport) => void,
) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    api.listDrafts().then(setDrafts, () => setDrafts([]));
  }, []);

  const saveDraft = async (format: "xlsx" | "csv") => {
    if (!sessionId) return;
    setDraftState("saving");
    const result = await api.saveDraft(sessionId, mapping, format).then(
      () => "saved" as const,
      () => "failed" as const,
    );
    setDraftState(result);
  };

  return {
    drafts,
    draftState,
    remembered,
    saveDraft,
    reopen: (draftId: string) =>
      run(async () => accept(await api.reopenDraft(draftId))),
    discardDraft: (draftId: string) =>
      run(async () => {
        await api.discardDraft(draftId);
        setDrafts((current) =>
          current.filter((draft) => draft.draftId !== draftId),
        );
      }),
    remember: () =>
      run(async () => {
        if (!sessionId) return;
        await api.rememberMapping(
          sessionId,
          headers.join(", ").slice(0, SETUP_NAME_LENGTH),
          mapping,
        );
        setRemembered(true);
      }),
    reset: () => {
      setDraftState("idle");
      setRemembered(false);
    },
  };
}
