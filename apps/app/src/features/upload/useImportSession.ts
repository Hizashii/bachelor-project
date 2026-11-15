// The first half of an upload: choose a file, adjust the column choices, check a sample.
// Drafts and remembered setups live in useDraftLibrary.

import { useState } from "react";
import type {
  ColumnMapping,
  FileInspection,
  OpenedImport,
  SampleRow,
} from "./types";
import * as api from "./uploadApi";
import { useDraftLibrary } from "./useDraftLibrary";
import { useRunner } from "./useRunner";

export function useImportSession() {
  const { busy, error, run } = useRunner();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<FileInspection | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sample, setSample] = useState<SampleRow[] | null>(null);
  const [known, setKnown] = useState<OpenedImport["knownTemplate"]>(null);

  const accept = (opened: OpenedImport) => {
    setSessionId(opened.sessionId);
    setInspection(opened.inspection);
    setMapping(opened.inspection.mapping);
    setKnown(opened.knownTemplate ?? null);
    library.reset();
  };
  const library = useDraftLibrary(
    sessionId,
    mapping,
    inspection?.headers ?? [],
    run,
    accept,
  );

  const startOver = () =>
    run(async () => {
      if (sessionId) await api.discardImport(sessionId);
      setSessionId(null);
      setInspection(null);
      setSample(null);
    });

  return {
    busy,
    error,
    sessionId,
    inspection,
    mapping,
    sample,
    known,
    library,
    setMapping,
    startOver,
    open: (file: File) => run(async () => accept(await api.uploadFile(file))),
    checkSample: () =>
      run(async () => {
        if (sessionId) setSample(await api.checkSample(sessionId, mapping));
      }),
  };
}
