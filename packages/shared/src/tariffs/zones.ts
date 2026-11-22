// Postcode zone rules: turn ranges into number intervals, find overlaps and gaps,
// and look up the zone for a postcode. Each carrier chooses its own precision.
// Not for prices: see calculate.ts.

import type { TariffPostcodeRange, TariffZone } from "./tariff.ts";

export type Interval = { low: number; high: number };

export type ZoneProblem =
  | { code: "invalid_range"; zoneId: string }
  | { code: "reversed_range"; zoneId: string }
  | { code: "duplicate_range"; zoneIds: [string, string] }
  | { code: "overlap"; zoneIds: [string, string] };

const DIGIT_BASE = 10;

// "26" with length 4 covers 2600 to 2699 when used as a start, 2600 to 2699 as an end too:
// the end of a range includes every postcode that begins with those digits.
export function rangeToInterval(
  range: TariffPostcodeRange,
  length: number,
): Interval | null {
  if (range.from.length > length || range.to.length > length) return null;
  const low = Number(range.from.padEnd(length, "0"));
  const high = Number(range.to.padEnd(length, "9"));
  return Number.isNaN(low) || Number.isNaN(high) ? null : { low, high };
}

type Labelled = { zoneId: string; interval: Interval };

export function validateZones(
  zones: readonly TariffZone[],
  length: number,
): ZoneProblem[] {
  const problems: ZoneProblem[] = [];
  const intervals: Labelled[] = [];
  for (const zone of zones) {
    for (const range of zone.ranges) {
      const interval = rangeToInterval(range, length);
      if (interval === null) {
        problems.push({ code: "invalid_range", zoneId: zone.id });
      } else if (interval.low > interval.high) {
        problems.push({ code: "reversed_range", zoneId: zone.id });
      } else {
        intervals.push({ zoneId: zone.id, interval });
      }
    }
  }
  return [...problems, ...findCollisions(intervals)];
}

function findCollisions(intervals: readonly Labelled[]): ZoneProblem[] {
  const problems: ZoneProblem[] = [];
  const sorted = [...intervals].sort((a, b) => a.interval.low - b.interval.low);
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index] as Labelled;
    for (let next = index + 1; next < sorted.length; next += 1) {
      const other = sorted[next] as Labelled;
      if (other.interval.low > current.interval.high) break;
      const zoneIds: [string, string] = [current.zoneId, other.zoneId];
      const same =
        current.interval.low === other.interval.low &&
        current.interval.high === other.interval.high;
      problems.push({ code: same ? "duplicate_range" : "overlap", zoneIds });
    }
  }
  return problems;
}

// Postcodes inside the valid span that no zone covers, as intervals.
export function findCoverageGaps(
  zones: readonly TariffZone[],
  length: number,
): Interval[] {
  const covered = zones
    .flatMap((zone) => zone.ranges)
    .map((range) => rangeToInterval(range, length))
    .filter((interval): interval is Interval => interval !== null)
    .sort((a, b) => a.low - b.low);
  const gaps: Interval[] = [];
  let next = 0;
  for (const { low, high } of covered) {
    if (low > next) gaps.push({ low: next, high: low - 1 });
    next = Math.max(next, high + 1);
  }
  const last = DIGIT_BASE ** length - 1;
  if (next <= last) gaps.push({ low: next, high: last });
  return gaps;
}

export function findZone(
  postcode: string,
  zones: readonly TariffZone[],
  length: number,
): TariffZone | null {
  if (postcode.length !== length || !/^\d+$/.test(postcode)) return null;
  const value = Number(postcode);
  const matches = zones.filter((zone) =>
    zone.ranges.some((range) => {
      const interval = rangeToInterval(range, length);
      return (
        interval !== null && value >= interval.low && value <= interval.high
      );
    }),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function postcodeInRanges(
  postcode: string,
  ranges: readonly TariffPostcodeRange[],
  length: number,
): boolean {
  if (!/^\d+$/.test(postcode)) return false;
  const value = Number(postcode);
  return ranges.some((range) => {
    const interval = rangeToInterval(range, length);
    return interval !== null && value >= interval.low && value <= interval.high;
  });
}
