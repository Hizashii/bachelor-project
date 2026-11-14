// Calls the import endpoints. The server keeps the file; the browser only holds
// the small preview and the column choices, never the rows of a large file.

import { apiFetch, postJson } from "../../api/client";
import type {
  ColumnMapping,
  DraftSummary,
  JobView,
  OpenedImport,
  ProcessSummaryView,
  SampleRow,
} from "./types";

type Format = "xlsx" | "csv";

export function uploadFile(file: File) {
  return apiFetch<OpenedImport>(
    `/api/imports?name=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: file,
    },
  );
}

export function checkSample(sessionId: string, mapping: ColumnMapping) {
  return postJson<SampleRow[]>(`/api/imports/${sessionId}/preview`, {
    mapping,
  });
}

export function startProcessing(
  sessionId: string,
  mapping: ColumnMapping,
  format: Format,
) {
  return postJson<JobView>(`/api/imports/${sessionId}/process`, {
    mapping,
    format,
  });
}

export function getJob(sessionId: string) {
  return apiFetch<JobView<ProcessSummaryView> | null>(
    `/api/imports/${sessionId}/job`,
  );
}

export const cancelJob = (sessionId: string) =>
  postJson<JobView>(`/api/imports/${sessionId}/cancel`, {});
export const retryJob = (sessionId: string) =>
  postJson<JobView>(`/api/imports/${sessionId}/retry`, {});
export const saveToCloud = (sessionId: string) =>
  postJson<unknown>(`/api/imports/${sessionId}/save`, {});

export async function downloadResult(sessionId: string): Promise<undefined> {
  const { token } = await postJson<{ token: string }>(
    `/api/imports/${sessionId}/download`,
    {},
  );
  window.location.assign(`/api/downloads/${token}`);
  return undefined;
}

export const discardImport = (sessionId: string) =>
  apiFetch<{ ok: boolean }>(`/api/imports/${sessionId}`, { method: "DELETE" });

export const saveDraft = (
  sessionId: string,
  mapping: ColumnMapping,
  format: Format,
) =>
  postJson<DraftSummary>(`/api/imports/${sessionId}/draft`, {
    mapping,
    format,
  });

export const rememberMapping = (
  sessionId: string,
  name: string,
  mapping: ColumnMapping,
) =>
  postJson<unknown>(`/api/imports/${sessionId}/remember-mapping`, {
    name,
    mapping,
  });

export const listDrafts = () => apiFetch<DraftSummary[]>("/api/drafts");

export const reopenDraft = (draftId: string) =>
  postJson<OpenedImport>(`/api/drafts/${draftId}/reopen`, {});

export const discardDraft = (draftId: string) =>
  apiFetch<{ ok: boolean }>(`/api/drafts/${draftId}`, { method: "DELETE" });
