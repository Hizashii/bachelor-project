// The freight price calculation for one shipment and one tariff version.
// Order: base price, minimum charge, rounding, discounts, surcharges, total.
// Every step is returned as a line so a person can check the result by hand.
// Not for choosing which tariff applies: see lifecycle.ts. Not for screens.

import {
  basisPointsOf,
  fromMilli,
  mulDivRound,
  roundToStep,
  roundUpToStep,
  toMilli,
} from "./money.ts";
import type { PricingMethod, Tariff, TariffSurcharge } from "./tariff.ts";
import { findZone, postcodeInRanges } from "./zones.ts";

export type PriceShipment = {
  originPostcode: string | null;
  destinationPostcode: string | null;
  // Collection date, "YYYY-MM-DD". Decides which tariff dates apply.
  date: string;
  weightKg: number | null;
  pallets: number | null;
  loadingMeters: number | null;
  cubicMeters: number | null;
};

export type BreakdownLine = { label: string; amountMinor: number };

export type PriceFailure =
  | "outside_dates"
  | "missing_postcode"
  | "origin_not_covered"
  | "no_zone"
  | "missing_quantity"
  | "restriction_exceeded"
  | "no_bracket"
  | "missing_rate";

export type PriceResult =
  | {
      status: "priced";
      tariffId: string;
      version: number;
      currency: string;
      zoneName: string;
      chargeableQuantity: number;
      totalMinor: number;
      lines: BreakdownLine[];
    }
  | { status: "unpriced"; reason: PriceFailure; message: string };

type Quantities = Record<PricingMethod, number | null>;

const PER_100KG_DIVISOR = 100n;
const MILLI_PER_UNIT = 1000n;

function unpriced(reason: PriceFailure, message: string): PriceResult {
  return { status: "unpriced", reason, message };
}

function quantities(shipment: PriceShipment): Quantities {
  return {
    per_shipment: shipment.weightKg,
    per_100kg: shipment.weightKg,
    per_pallet: shipment.pallets,
    per_ldm: shipment.loadingMeters,
    per_cbm: shipment.cubicMeters,
  };
}

export function calculatePrice(
  tariff: Tariff,
  shipment: PriceShipment,
): PriceResult {
  const early = checkEligibility(tariff, shipment);
  if (early) return early;
  const zone = findZone(
    shipment.destinationPostcode ?? "",
    tariff.zones,
    tariff.postcodeLength,
  );
  if (!zone)
    return unpriced("no_zone", "No zone covers the destination postcode.");
  const quantity = quantities(shipment)[tariff.method];
  const singleBracket =
    tariff.method === "per_shipment" &&
    tariff.brackets.length === 1 &&
    tariff.brackets[0]?.to === null;
  if (quantity === null && !singleBracket) {
    return unpriced(
      "missing_quantity",
      "The shipment has no quantity for this tariff.",
    );
  }
  const chargeable = chargeableMilli(tariff, toMilli(quantity ?? 0));
  const bracketIndex = findBracket(tariff, chargeable, singleBracket);
  if (bracketIndex < 0)
    return unpriced("no_bracket", "No price bracket fits the quantity.");
  const rate = tariff.rates.find(
    (r) => r.zoneId === zone.id && r.bracketIndex === bracketIndex,
  );
  if (rate?.amountMinor == null) {
    return unpriced(
      "missing_rate",
      "The tariff has no rate for this zone and bracket.",
    );
  }
  return buildResult(tariff, zone.name, chargeable, BigInt(rate.amountMinor));
}

function checkEligibility(
  tariff: Tariff,
  shipment: PriceShipment,
): PriceResult | null {
  const { date } = shipment;
  if (
    date < tariff.effectiveFrom ||
    (tariff.effectiveTo !== null && date > tariff.effectiveTo)
  ) {
    return unpriced(
      "outside_dates",
      "The tariff is not valid on the collection date.",
    );
  }
  if (!shipment.destinationPostcode || !shipment.originPostcode) {
    return unpriced(
      "missing_postcode",
      "Origin and destination postcodes are required.",
    );
  }
  const { originRanges } = tariff.restrictions;
  const origin = shipment.originPostcode;
  if (
    originRanges.length > 0 &&
    !postcodeInRanges(origin, originRanges, tariff.postcodeLength)
  ) {
    return unpriced(
      "origin_not_covered",
      "The carrier does not collect from this postcode.",
    );
  }
  return exceedsRestriction(tariff, shipment)
    ? unpriced(
        "restriction_exceeded",
        "The shipment is larger than the carrier accepts.",
      )
    : null;
}

// Quantities beyond this cannot be real and would overflow the exact arithmetic.
const MAX_QUANTITY = 1_000_000_000;

function exceedsRestriction(tariff: Tariff, shipment: PriceShipment): boolean {
  const { restrictions: r } = tariff;
  const over = (value: number | null, max: number | null) =>
    value !== null &&
    (!Number.isFinite(value) ||
      value > MAX_QUANTITY ||
      (max !== null && value > max));
  return (
    over(shipment.weightKg, r.maxWeightKg) ||
    over(shipment.pallets, r.maxPallets) ||
    over(shipment.loadingMeters, r.maxLoadingMeters) ||
    over(shipment.cubicMeters, r.maxCubicMeters)
  );
}

function chargeableMilli(tariff: Tariff, quantityMilli: bigint): bigint {
  if (tariff.quantityStep === null) return quantityMilli;
  return roundUpToStep(quantityMilli, toMilli(tariff.quantityStep));
}

// A bracket holds quantities above its lower limit, up to and including its upper limit.
function findBracket(
  tariff: Tariff,
  chargeable: bigint,
  single: boolean,
): number {
  if (single) return tariff.brackets.length === 0 ? -1 : 0;
  return tariff.brackets.findIndex(
    (b) =>
      chargeable > toMilli(b.from) &&
      (b.to === null || chargeable <= toMilli(b.to)),
  );
}

function buildResult(
  tariff: Tariff,
  zoneName: string,
  chargeable: bigint,
  rate: bigint,
): PriceResult {
  const lines: BreakdownLine[] = [];
  const perUnit =
    tariff.method === "per_shipment" ? MILLI_PER_UNIT : chargeable;
  const divisor =
    MILLI_PER_UNIT * (tariff.method === "per_100kg" ? PER_100KG_DIVISOR : 1n);
  const unitAmount = (amount: bigint) => mulDivRound(amount, perUnit, divisor);
  let freight = unitAmount(rate);
  lines.push({ label: "Base freight", amountMinor: Number(freight) });
  freight = applyMinimum(tariff, freight, lines);
  freight = applyRounding(tariff, freight, lines);
  const net = applyDiscounts(tariff, freight, lines);
  const total = applySurcharges(tariff.surcharges, net, unitAmount, lines);
  return {
    status: "priced",
    tariffId: tariff.tariffId,
    version: tariff.version,
    currency: tariff.currency,
    zoneName,
    chargeableQuantity: fromMilli(chargeable),
    totalMinor: Number(total),
    lines,
  };
}

function applyMinimum(
  tariff: Tariff,
  freight: bigint,
  lines: BreakdownLine[],
): bigint {
  const minimum = BigInt(tariff.minimumChargeMinor ?? 0);
  if (freight >= minimum) return freight;
  lines.push({
    label: "Raised to minimum charge",
    amountMinor: Number(minimum - freight),
  });
  return minimum;
}

function applyRounding(
  tariff: Tariff,
  freight: bigint,
  lines: BreakdownLine[],
): bigint {
  const rounded = roundToStep(freight, BigInt(tariff.roundingStepMinor));
  if (rounded !== freight) {
    lines.push({ label: "Rounding", amountMinor: Number(rounded - freight) });
  }
  return rounded;
}

function applyDiscounts(
  tariff: Tariff,
  freight: bigint,
  lines: BreakdownLine[],
): bigint {
  let net = freight;
  for (const discount of tariff.discounts) {
    const amount = basisPointsOf(freight, discount.basisPoints);
    lines.push({ label: discount.name, amountMinor: -Number(amount) });
    net -= amount;
  }
  return net;
}

function applySurcharges(
  surcharges: readonly TariffSurcharge[],
  net: bigint,
  perUnit: (amount: bigint) => bigint,
  lines: BreakdownLine[],
): bigint {
  let total = net;
  for (const surcharge of surcharges) {
    const { calculation } = surcharge;
    const amount =
      calculation.kind === "percentage"
        ? basisPointsOf(net, calculation.basisPoints)
        : calculation.kind === "per_unit"
          ? perUnit(BigInt(calculation.amountMinor))
          : BigInt(calculation.amountMinor);
    lines.push({ label: surcharge.name, amountMinor: Number(amount) });
    total += amount;
  }
  return total;
}
