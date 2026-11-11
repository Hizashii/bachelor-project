// This file will hold the one shared check that tells whether an offer is complete and consistent.
// Placeholder: it refuses every offer until the rate editor feature provides the real rules.

import type { StoredBid } from "../contracts/offer.ts";

export type OfferIssue = { path: string; code: string; message: string };
export type OfferValidation = { complete: boolean; issues: OfferIssue[] };

export function validateOffer(
  _bid: StoredBid,
  _tenderCurrency: string,
): OfferValidation {
  const issue = {
    path: "",
    code: "validator_missing",
    message: "Offer checks are not available yet.",
  };
  return { complete: false, issues: [issue] };
}
