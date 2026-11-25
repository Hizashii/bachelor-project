// Keeps the list of who has bid up to date by asking the API every few seconds.
// It carries no prices, so it is safe to show while bids are sealed.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";

const REFRESH_MS = 5_000;

export type BidStatus = {
  carrierCompanyId: string;
  versionNumber: number;
  submittedAtUtc: string | null;
};

export function useBidStatus(tenderId: string, active: boolean) {
  const [status, setStatus] = useState<BidStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    async function refresh() {
      if (document.hidden) return;
      try {
        const next = await apiFetch<BidStatus[]>(
          `/api/tenders/${tenderId}/bid-status`,
        );
        if (stopped) return;
        setStatus(next);
        setUpdatedAt(new Date());
      } catch {
        // The next refresh tries again.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [tenderId, active]);

  return { status, updatedAt };
}
