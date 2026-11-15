// The editing session for one carrier tariff: state, live checks, draft saving.
// "Saved" is only shown after the server confirms it; an unsaved change is always visible.

import { validateTariff } from "@freight-desk/shared";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { apiFetch, postJson } from "../../api/client";
import {
  type EditorState,
  emptyState,
  stateFromTariff,
  type TariffMeta,
  toTariff,
} from "./tariffDraft.ts";
import { editorReducer } from "./tariffReducer.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "submitted";

const today = () => new Date().toISOString().slice(0, 10);
type EditorMeta = Pick<TariffMeta, "tariffId" | "version">;

export function useTariffEditor(
  organisationId: string | null,
  userId: string | null,
) {
  const [initial] = useState(() => emptyState(today()));
  const [state, dispatch] = useReducer(editorReducer, initial);
  const [meta, setMeta] = useState<EditorMeta>(() => ({
    tariffId: crypto.randomUUID(),
    version: 1,
  }));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initial),
  );
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const loadedFor = useRef<string | null>(null);
  const snapshot = JSON.stringify(state);

  useEffect(() => {
    if (!organisationId || loadedFor.current === organisationId) return;
    loadedFor.current = organisationId;
    void apiFetch<{ tariff: ReturnType<typeof toTariff>; etag: string } | null>(
      "/api/tariffs/mine",
    )
      .then((saved) => {
        if (!saved) return;
        const next = stateFromTariff(saved.tariff);
        setMeta({
          tariffId: saved.tariff.tariffId,
          version: saved.tariff.version,
        });
        setEtag(saved.etag);
        setSavedSnapshot(JSON.stringify(next));
        dispatch({ type: "replace", state: next });
      })
      .catch(() => undefined);
  }, [organisationId]);

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
