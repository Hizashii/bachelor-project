// The editing session for one carrier tariff: state, live checks, draft saving.
// "Saved" is only shown after the server confirms it; an unsaved change is always visible.

import { validateTariff } from "@freight-desk/shared";
import { useMemo, useReducer, useState } from "react";
import { apiFetch, postJson } from "../../api/client";
import {
  type EditorState,
  emptyState,
  type TariffMeta,
  toTariff,
} from "./tariffDraft.ts";
import { editorReducer } from "./tariffReducer.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "submitted";

const today = () => new Date().toISOString().slice(0, 10);

export function useTariffEditor(
  organisationId: string | null,
  userId: string | null,
) {
  const [initial] = useState(() => emptyState(today()));
  const [state, dispatch] = useReducer(editorReducer, initial);
  const [meta] = useState(() => ({
    tariffId: crypto.randomUUID(),
    version: 1,
  }));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const snapshot = JSON.stringify(state);

  const tariff = useMemo(() => {
    const full: TariffMeta = {
      ...meta,
      carrierOrganisationId: organisationId ?? "",
      userId: userId ?? "",
    };
    return toTariff(state, full, new Date().toISOString());
  }, [state, meta, organisationId, userId]);
  const validation = useMemo(() => validateTariff(tariff), [tariff]);

  async function persist(next: SaveStatus, afterSave?: () => Promise<unknown>) {
    setStatus("saving");
    try {
      const saved = await apiFetch<{ etag?: string }>("/api/tariffs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tariff, ifMatch: etag }),
      });
      setEtag(saved.etag);
      await afterSave?.();
      setSavedSnapshot(snapshot);
      setStatus(next);
    } catch {
      setStatus("failed");
    }
  }

  const saveDraft = () => persist("saved");
  const submit = () =>
    persist("submitted", () =>
      postJson(
        `/api/tariffs/${tariff.carrierOrganisationId}/${tariff.tariffId}/${tariff.version}/submit`,
        {},
      ),
    );
  const replace = (next: EditorState) =>
    dispatch({ type: "replace", state: next });
  const dirty = savedSnapshot !== snapshot;

  return {
    state,
    dispatch,
    replace,
    tariff,
    validation,
    status,
    dirty,
    saveDraft,
    submit,
  };
}
