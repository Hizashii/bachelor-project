// Runs one async action at a time and keeps its busy and error state for a screen.

import { useCallback, useState } from "react";

export function useRunner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}
