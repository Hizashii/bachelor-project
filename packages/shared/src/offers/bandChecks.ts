// Checks the price bands: units, bases, currency, amounts, delivery times, and that
// bands of one zone and unit neither overlap nor leave a hole between them.
// Quantities are compared as whole hundredths so decimals cannot drift.

import type { StoredBid } from "../contracts/offer.ts";
import type { OfferIssue } from "./validate.ts";

type Band = StoredBid["rates"][number];
type Indexed = { band: Band; index: number };

const HUNDREDTHS = 100;
const MAX_BUSINESS_DAYS = 90;
// The smallest step between two neighbouring bands, in hundredths of the unit.
const UNIT_STEP: Record<Band["unit"], number> = {
  kg: HUNDREDTHS,
  pallets: HUNDREDTHS,
  packages: HUNDREDTHS,
  CBM: 1,
  LDM: 1,
};
const BASES_FOR_UNIT: Record<Band["unit"], Band["basis"][]> = {
  kg: ["per_shipment", "per_kg", "per_100kg"],
  pallets: ["per_shipment", "per_pallet"],
  CBM: ["per_shipment", "per_cbm"],
  LDM: ["per_shipment", "per_ldm"],
  packages: ["per_shipment", "per_package"],
};

const scaled = (value: number): number => Math.round(value * HUNDREDTHS);

function issue(path: string, code: string, message: string): OfferIssue {
  return { path, code, message };
}

function checkMoney(band: Band, path: string, currency: string): OfferIssue[] {
  const issues: OfferIssue[] = [];
  const { amountMinor } = band.price;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    issues.push(
      issue(
        `${path}.price`,
        "invalid_amount",
        "The price must be a whole number of cents, zero or more.",
      ),
    );
  } else if (amountMinor === 0) {
    issues.push(
      issue(
        `${path}.price`,
        "zero_price",
        "This price is zero. Check that it is intended.",
      ),
    );
  }
  if (band.price.currency !== currency) {
    issues.push(
      issue(
        `${path}.price.currency`,
        "currency_mismatch",
        `Prices must be in ${currency}, as set by the tender.`,
      ),
    );
  }
  return issues;
}

function checkTime(band: Band, path: string): OfferIssue[] {
  const { minimumBusinessDays: min, maximumBusinessDays: max } =
    band.deliveryTime;
  const whole = Number.isInteger(min) && Number.isInteger(max);
  if (whole && min >= 0 && min <= max && max <= MAX_BUSINESS_DAYS) return [];
  return [
    issue(
      `${path}.deliveryTime`,
      "bad_delivery_time",
      `Delivery time must be whole business days, from 0 to ${MAX_BUSINESS_DAYS}, with the shortest not above the longest.`,
    ),
  ];
}

function checkLinks(bid: StoredBid, band: Band, path: string): OfferIssue[] {
  const issues: OfferIssue[] = [];
  if (!bid.zones.some((z) => z.id === band.zoneId)) {
    issues.push(
      issue(
        `${path}.zoneId`,
        "unknown_zone",
        "This price points to a zone that does not exist.",
      ),
    );
  }
  if (!bid.notes.supportedUnits.includes(band.unit)) {
    issues.push(
      issue(
        `${path}.unit`,
        "unit_not_supported",
        `You price in ${band.unit} here, but it is not in your list of units.`,
      ),
    );
  }
  if (!BASES_FOR_UNIT[band.unit].includes(band.basis)) {
    issues.push(
      issue(
        `${path}.basis`,
        "basis_mismatch",
        `The way of pricing does not fit the unit ${band.unit}.`,
      ),
    );
  }
  return issues;
}

function checkQuantity(band: Band, path: string): OfferIssue[] {
  const { fromQuantity: from, toQuantity: to } = band;
  const bad =
    !Number.isFinite(from) ||
    from < 0 ||
    (to !== null && (!Number.isFinite(to) || to < from));
  return bad
    ? [
        issue(
          `${path}.fromQuantity`,
          "invalid_quantity",
          "The quantity range is not valid.",
        ),
      ]
    : [];
}

function checkBand(
  bid: StoredBid,
  { band, index }: Indexed,
  currency: string,
): OfferIssue[] {
  const path = `rates[${index}]`;
  return [
    ...checkMoney(band, path, currency),
    ...checkTime(band, path),
    ...checkLinks(bid, band, path),
    ...checkQuantity(band, path),
  ];
}

function checkGroup(group: Indexed[]): OfferIssue[] {
  const sorted = [...group].sort(
    (a, b) => scaled(a.band.fromQuantity) - scaled(b.band.fromQuantity),
  );
  const issues: OfferIssue[] = [];
  sorted.slice(1).forEach((next, i) => {
    const prev = sorted[i] as Indexed;
    const path = `rates[${next.index}]`;
    const nextFrom = scaled(next.band.fromQuantity);
    const prevTo = prev.band.toQuantity;
    if (prevTo === null || nextFrom <= scaled(prevTo)) {
      issues.push(
        issue(
          path,
          "ambiguous_pricing",
          "Two prices match the same zone, unit and quantity. Make the ranges not overlap.",
        ),
      );
    } else if (nextFrom - scaled(prevTo) > UNIT_STEP[next.band.unit]) {
      issues.push(
        issue(
          path,
          "rate_gap",
          "Some quantities between these two prices have no price. Close the gap.",
        ),
      );
    }
  });
  return issues;
}

function checkZonesPriced(bid: StoredBid): OfferIssue[] {
  return bid.zones.flatMap((zone, index) =>
    bid.rates.some((r) => r.zoneId === zone.id)
      ? []
      : [
          issue(
            `zones[${index}]`,
            "zone_without_rates",
            `Zone ${zone.name} has no prices yet.`,
          ),
        ],
  );
}

export function checkBands(bid: StoredBid, currency: string): OfferIssue[] {
  const groups = new Map<string, Indexed[]>();
  bid.rates.forEach((band, index) => {
    const key = `${band.zoneId}|${band.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), { band, index }]);
  });
  const all = bid.rates.map((band, index) => ({ band, index }));
  return [
    ...all.flatMap((entry) => checkBand(bid, entry, currency)),
    ...[...groups.values()].flatMap(checkGroup),
    ...checkZonesPriced(bid),
  ];
}
