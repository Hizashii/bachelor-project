// Checks fuel surcharges and additional fees: a name, a sensible percentage or amount,
// and the tender currency for fixed amounts.

import type { StoredBid } from "../contracts/offer.ts";
import type { OfferIssue } from "./validate.ts";

const MAX_BASIS_POINTS = 10_000;

type Surcharge = StoredBid["surcharges"][number];

function checkOne(
  surcharge: Surcharge,
  index: number,
  currency: string,
): OfferIssue[] {
  const path = `surcharges[${index}]`;
  const issues: OfferIssue[] = [];
  const calc = surcharge.calculation;
  if (surcharge.name.trim() === "") {
    issues.push({
      path: `${path}.name`,
      code: "surcharge_unnamed",
      message: "Give this surcharge a name.",
    });
  }
  if (calc.kind === "percentage") {
    const { basisPoints } = calc;
    if (
      !Number.isInteger(basisPoints) ||
      basisPoints < 0 ||
      basisPoints > MAX_BASIS_POINTS
    ) {
      issues.push({
        path: `${path}.calculation`,
        code: "surcharge_invalid",
        message: "The percentage must be between 0 and 100.",
      });
    }
    return issues;
  }
  const { amountMinor } = calc.amount;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    issues.push({
      path: `${path}.calculation`,
      code: "surcharge_invalid",
      message: "The amount must be zero or more.",
    });
  }
  if (calc.amount.currency !== currency) {
    issues.push({
      path: `${path}.calculation`,
      code: "currency_mismatch",
      message: `Amounts must be in ${currency}, as set by the tender.`,
    });
  }
  return issues;
}

export function checkSurcharges(
  surcharges: Surcharge[],
  currency: string,
): OfferIssue[] {
  return surcharges.flatMap((s, i) => checkOne(s, i, currency));
}
