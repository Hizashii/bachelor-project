// Checks that a tariff is complete and consistent before it can be submitted.
// Errors block submission. Warnings are shown to the carrier but do not block.
// Not for calculating prices: see calculate.ts.

import type { Tariff } from "./tariff.ts";
import {
  findCoverageGaps,
  type Interval,
  validateZones,
  type ZoneProblem,
} from "./zones.ts";

export type TariffError =
  | ZoneProblem
  | { code: "no_zones" }
  | { code: "empty_zone"; zoneId: string }
  | { code: "no_brackets" }
  | { code: "bracket_must_start_at_zero" }
  | { code: "bracket_gap_or_overlap"; bracketIndex: number }
  | { code: "bracket_not_increasing"; bracketIndex: number }
  | { code: "duplicate_rate"; zoneId: string; bracketIndex: number }
  | { code: "bracket_open_end_not_last"; bracketIndex: number }
  | { code: "missing_rate"; zoneId: string; bracketIndex: number }
  | { code: "rate_for_unknown_cell"; zoneId: string; bracketIndex: number }
  | { code: "dates_reversed" }
  | { code: "discounts_exceed_100_percent" };

export type TariffWarning =
  | { code: "zero_rate"; zoneId: string; bracketIndex: number }
  | { code: "postcode_gaps"; gaps: Interval[] };

export type TariffValidation = {
  complete: boolean;
  errors: TariffError[];
  warnings: TariffWarning[];
};

const FULL_PERCENT_BASIS_POINTS = 10_000;

export function validateTariff(tariff: Tariff): TariffValidation {
  const errors: TariffError[] = [
    ...zoneErrors(tariff),
    ...bracketErrors(tariff),
    ...rateErrors(tariff),
  ];
  if (
    tariff.effectiveTo !== null &&
    tariff.effectiveTo < tariff.effectiveFrom
  ) {
    errors.push({ code: "dates_reversed" });
  }
  const discountTotal = tariff.discounts.reduce(
    (sum, d) => sum + d.basisPoints,
    0,
  );
  if (discountTotal > FULL_PERCENT_BASIS_POINTS) {
    errors.push({ code: "discounts_exceed_100_percent" });
  }
  return { complete: errors.length === 0, errors, warnings: warnings(tariff) };
}

function zoneErrors(tariff: Tariff): TariffError[] {
  if (tariff.zones.length === 0) return [{ code: "no_zones" }];
  const empty = tariff.zones
    .filter((zone) => zone.ranges.length === 0)
    .map((zone): TariffError => ({ code: "empty_zone", zoneId: zone.id }));
  return [...empty, ...validateZones(tariff.zones, tariff.postcodeLength)];
}

function bracketErrors(tariff: Tariff): TariffError[] {
  const { brackets } = tariff;
  if (brackets.length === 0) return [{ code: "no_brackets" }];
  const errors: TariffError[] = [];
  if (brackets[0]?.from !== 0)
    errors.push({ code: "bracket_must_start_at_zero" });
  brackets.forEach((bracket, index) => {
    const previous = brackets[index - 1];
    if (previous && previous.to !== bracket.from) {
      errors.push({ code: "bracket_gap_or_overlap", bracketIndex: index });
    }
    if (bracket.to !== null && bracket.to <= bracket.from) {
      errors.push({ code: "bracket_not_increasing", bracketIndex: index });
    }
    const isLast = index === brackets.length - 1;
    if (bracket.to === null && !isLast) {
      errors.push({ code: "bracket_open_end_not_last", bracketIndex: index });
    }
  });
  return errors;
}

function rateErrors(tariff: Tariff): TariffError[] {
  const errors: TariffError[] = [];
  for (const zone of tariff.zones) {
    tariff.brackets.forEach((_, bracketIndex) => {
      const rate = tariff.rates.find(
        (r) => r.zoneId === zone.id && r.bracketIndex === bracketIndex,
      );
      if (rate?.amountMinor == null) {
        errors.push({ code: "missing_rate", zoneId: zone.id, bracketIndex });
      }
    });
  }
  const seen = new Set<string>();
  for (const rate of tariff.rates) {
    const cell = `${rate.zoneId}|${rate.bracketIndex}`;
    if (seen.has(cell)) {
      errors.push({
        code: "duplicate_rate",
        zoneId: rate.zoneId,
        bracketIndex: rate.bracketIndex,
      });
    }
    seen.add(cell);
    const knownZone = tariff.zones.some((zone) => zone.id === rate.zoneId);
    if (!knownZone || rate.bracketIndex >= tariff.brackets.length) {
      errors.push({
        code: "rate_for_unknown_cell",
        zoneId: rate.zoneId,
        bracketIndex: rate.bracketIndex,
      });
    }
  }
  return errors;
}

function warnings(tariff: Tariff): TariffWarning[] {
  const result: TariffWarning[] = tariff.rates
    .filter((rate) => rate.amountMinor === 0)
    .map((rate) => ({
      code: "zero_rate",
      zoneId: rate.zoneId,
      bracketIndex: rate.bracketIndex,
    }));
  const gaps = findCoverageGaps(tariff.zones, tariff.postcodeLength);
  if (gaps.length > 0 && tariff.zones.length > 0) {
    result.push({ code: "postcode_gaps", gaps });
  }
  return result;
}
