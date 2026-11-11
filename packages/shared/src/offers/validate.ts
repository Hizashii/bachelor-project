// The one shared check that tells whether an offer is complete and consistent.
// It is pure: no clock, no files, no network. Money stays in integer minor units.
// It only judges the offer; it never changes it. A warning does not block sending.

import type { StoredBid } from "../contracts/offer.ts";
import { checkBands } from "./bandChecks.ts";
import { checkSurcharges } from "./surchargeChecks.ts";
import { checkZones } from "./zoneChecks.ts";

export type OfferIssue = { path: string; code: string; message: string };
export type OfferValidation = { complete: boolean; issues: OfferIssue[] };

// Issues with these codes are shown but do not stop an offer from being complete.
export const WARNING_CODES: readonly string[] = ["zero_price"];

export function isBlocking(issue: OfferIssue): boolean {
  return !WARNING_CODES.includes(issue.code);
}

function checkBasics(bid: StoredBid): OfferIssue[] {
  const issues: OfferIssue[] = [];
  if (bid.zones.length === 0) {
    issues.push({
      path: "zones",
      code: "no_zones",
      message: "Add at least one zone.",
    });
  }
  if (bid.notes.supportedUnits.length === 0) {
    issues.push({
      path: "notes.supportedUnits",
      code: "no_units",
      message: "Choose at least one unit you price in.",
    });
  }
  if (bid.rates.length === 0) {
    issues.push({
      path: "rates",
      code: "no_rates",
      message: "Add at least one price.",
    });
  }
  return issues;
}

export function validateOffer(
  bid: StoredBid,
  tenderCurrency: string,
): OfferValidation {
  const issues = [
    ...checkBasics(bid),
    ...checkZones(bid.zones),
    ...checkBands(bid, tenderCurrency),
    ...checkSurcharges(bid.surcharges, tenderCurrency),
  ];
  return { complete: !issues.some(isBlocking), issues };
}
