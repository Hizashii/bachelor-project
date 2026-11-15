// The second half of an upload: process the file, follow progress, then save or download.
// A saved file is only reported as saved after the server confirmed it.

import { useEffect, useState } from "react";
import type { ColumnMapping, JobView } from "./types";
import * as api from "./uploadApi";
import { useRunner } from "./useRunner";

export type SaveState = "idle" | "saving" | "saved" | "failed";
export type OutputFormat = "xlsx" | "csv";

const POLL_MS = 1000;

export function useImportJob(sessionId: string | null, mapping: ColumnMapping) {
  const { busy, error, run } = useRunner();
  const [job, setJob] = useState<JobView | null>(null);
  const [format, setFormat] = useState<OutputFormat>("xlsx");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const active = job?.state === "pending" || job?.state === "processing";

  useEffect(() => {
    if (!sessionId || !active) return;
    const timer = setInterval(() => {
      api.getJob(sessionId).then(setJob, () => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [sessionId, active]);

  const withSession = (
    action: (id: string) => Promise<JobView | undefined>,
    keep = false,
  ) =>
    run(async () => {
      if (!sessionId) return;
      const next = await action(sessionId);
      if (next && !keep) setJob(next);
    });

  const save = async () => {
    if (!sessionId) return;
    setSaveState("saving");
    setSaveState(
      await api.saveToCloud(sessionId).then(
        () => "saved" as const,
        () => "failed" as const,
      ),
    );
  };

  return {
    busy,
    error,
    job,
    format,
    saveState,
    setFormat,
    save,
    start: () => withSession((id) => api.startProcessing(id, mapping, format)),
    cancel: () => withSession(api.cancelJob),
    retry: () => withSession(api.retryJob),
    download: () => withSession(api.downloadResult, true),
  };
}
