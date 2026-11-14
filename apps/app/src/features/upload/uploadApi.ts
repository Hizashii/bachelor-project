// Calls the import endpoints. The server keeps the file; the browser only holds
// the small preview and the column choices, never the rows of a large file.

import { apiFetch, postJson } from "../../api/client";
import type {
  ColumnMapping,
  FileInspection,
  JobView,
  ProcessSummaryView,
  SampleRow,
} from "./types";

export function uploadFile(file: File) {
  return apiFetch<{ sessionId: string; inspection: FileInspection }>(
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
  format: "xlsx" | "csv",
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
