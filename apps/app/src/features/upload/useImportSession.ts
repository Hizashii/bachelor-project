// The first half of an upload: choose a file, adjust the column choices, check a sample.

import { useState } from "react";
import type { ColumnMapping, FileInspection, SampleRow } from "./types";
import * as api from "./uploadApi";
import { useRunner } from "./useRunner";

export function useImportSession() {
  const { busy, error, run } = useRunner();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<FileInspection | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sample, setSample] = useState<SampleRow[] | null>(null);

  const open = (file: File) =>
    run(async () => {
      const opened = await api.uploadFile(file);
      setSessionId(opened.sessionId);
      setInspection(opened.inspection);
      setMapping(opened.inspection.mapping);
    });

  const startOver = () =>
    run(async () => {
      if (sessionId) await api.discardImport(sessionId);
      setSessionId(null);
      setInspection(null);
      setSample(null);
    });

  const checkSample = () =>
    run(async () => {
      if (sessionId) setSample(await api.checkSample(sessionId, mapping));
    });

  return {
    busy,
    error,
    sessionId,
    inspection,
    mapping,
    sample,
    setMapping,
    open,
    startOver,
    checkSample,
  };
}
