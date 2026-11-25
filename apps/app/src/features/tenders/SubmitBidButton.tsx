// Sends a carrier's saved price draft to S&A as a bid.

import { useState } from "react";
import { ApiError, apiFetch } from "../../api/client";
import type { getCopy } from "../../i18n";

type Props = {
  copy: ReturnType<typeof getCopy>;
  tenderId: string;
  disabled: boolean;
  onResult: (kind: "saved" | "error", text: string) => void;
};

export function SubmitBidButton({ copy, tenderId, disabled, onResult }: Props) {
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/tenders/${tenderId}/bid-draft/submit`, {
        method: "POST",
      });
      onResult("saved", copy.submittedOk);
    } catch (error) {
      onResult(
        "error",
        error instanceof ApiError ? error.message : copy.requestFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="button button-primary"
      disabled={disabled || busy}
      type="button"
      onClick={() => void submit()}
    >
      {busy ? copy.working : copy.submitForApproval}
    </button>
  );
}
