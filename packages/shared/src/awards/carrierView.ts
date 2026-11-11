// This file turns an award into the only thing a carrier may see: won, not won, or not decided yet.
// It copies no field from the award, so notes, snapshots and other carriers cannot leak by accident.

import type { AwardRecord } from "../contracts/award.ts";

export type CarrierAwardOutcome = "pending" | "won" | "not_won";
export type CarrierAwardView = {
  tenderId: string;
  outcome: CarrierAwardOutcome;
};

export function toCarrierView(
  tenderId: string,
  award: AwardRecord | null,
  carrierCompanyId: string,
): CarrierAwardView {
  if (award?.decision !== "confirmed") {
    return { tenderId, outcome: "pending" };
  }
  const won = award.carrierCompanyId === carrierCompanyId;
  return { tenderId, outcome: won ? "won" : "not_won" };
}
