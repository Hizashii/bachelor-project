// Prices one shipment for one carrier in one matched zone. It never guesses: a missing band,
// an unsupported unit or a foreign currency makes the shipment ineligible, never zero.
// Rules (see also docs/BUSINESS_RULES.md):
//  - bands match the shipment quantity by unit, from and to both inclusive, null "to" is open;
//    when two bands both match, the one with the lower "from" wins
//  - the minimum charge lifts the base price only; fuel and fees are added on top
//  - percentages are basis points of the base (after the minimum), rounded half up
//  - a "quantity" scoped fixed amount is multiplied by the quantity; "shipment" and
//    "rate_band" scoped amounts are charged once per shipment (one band is used per shipment)

import type { IneligibleReason } from "../contracts/comparison.ts";
import type { CarrierZone, StoredBid } from "../contracts/offer.ts";
import type {
  Quantity,
  RateBand,
  RateBasis,
  Surcharge,
  TransportUnit,
} from "../types/business.ts";
import { percentOf, scaledPrice, toMilli } from "./money.ts";

export type PricedLine = {
  baseMinor: number;
  fuelMinor: number;
  feesMinor: number;
  totalMinor: number;
  transitDays: number;
};
export type LineResult =
  | { ok: true; line: PricedLine }
  | { ok: false; reason: IneligibleReason };

const BASIS_UNIT: Record<RateBasis, TransportUnit | null> = {
  per_shipment: null,
  per_kg: "kg",
  per_100kg: "kg",
  per_pallet: "pallets",
  per_cbm: "CBM",
  per_ldm: "LDM",
  per_package: "packages",
};
const PER_100KG = 100;

function fail(reason: IneligibleReason): LineResult {
  return { ok: false, reason };
}

function findBand(
  bands: readonly RateBand[],
  quantity: Quantity,
): RateBand | null {
  const hits = bands
    .filter((b) => b.unit === quantity.unit)
    .filter((b) => quantity.value >= b.fromQuantity)
    .filter((b) => b.toQuantity === null || quantity.value <= b.toQuantity)
    .sort((a, b) => a.fromQuantity - b.fromQuantity);
  return hits[0] ?? null;
}

function baseAmount(band: RateBand, quantity: Quantity): number {
  const milli = toMilli(quantity.value);
  const { amountMinor } = band.price;
  if (band.basis === "per_shipment") return amountMinor;
  const per = band.basis === "per_100kg" ? PER_100KG : 1;
  return scaledPrice(amountMinor, milli, per);
}

// Returns minor units, or null when the surcharge is in another currency.
function surchargeAmount(
  s: Surcharge,
  baseMinor: number,
  quantity: Quantity,
  currency: string,
): number | null {
  const calc = s.calculation;
  if (calc.kind === "percentage") return percentOf(baseMinor, calc.basisPoints);
  if (calc.amount.currency !== currency) return null;
  if (s.appliesTo !== "quantity") return calc.amount.amountMinor;
  return scaledPrice(calc.amount.amountMinor, toMilli(quantity.value), 1);
}

function sumSurcharges(
  list: readonly Surcharge[],
  baseMinor: number,
  quantity: Quantity,
  currency: string,
): number | null {
  let total = 0;
  for (const s of list) {
    const amount = surchargeAmount(s, baseMinor, quantity, currency);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}

function bandsFor(bid: StoredBid, zone: CarrierZone): RateBand[] {
  return bid.rates.filter((r) => r.zoneId === zone.id);
}

// Picks the first shipment quantity the carrier prices in that also has a matching band.
function chooseBand(
  quantities: readonly Quantity[],
  supported: readonly TransportUnit[],
  bands: readonly RateBand[],
): { band: RateBand; quantity: Quantity } | IneligibleReason {
  const usable = quantities.filter((q) => supported.includes(q.unit));
  if (usable.length === 0) return "unit_unsupported";
  for (const quantity of usable) {
    const band = findBand(bands, quantity);
    if (band) return { band, quantity };
  }
  return "no_rate_band";
}

export function priceLine(
  quantities: readonly Quantity[],
  zone: CarrierZone,
  bid: StoredBid,
  currency: string,
): LineResult {
  const bands = bandsFor(bid, zone);
  if (bands.length === 0) return fail("missing_rate");
  const chosen = chooseBand(quantities, bid.notes.supportedUnits, bands);
  if (typeof chosen === "string") return fail(chosen);
  const { band, quantity } = chosen;
  if (band.price.currency !== currency) return fail("currency_mismatch");
  const need = BASIS_UNIT[band.basis];
  if (need !== null && need !== band.unit) return fail("invalid_offer");

  const rawBase = baseAmount(band, quantity);
  const baseMinor = Math.max(rawBase, bid.notes.minimumChargeMinor ?? 0);
  const fuel = bid.surcharges.filter((s) => s.kind === "fuel");
  const extra = bid.surcharges.filter((s) => s.kind === "additional");
  const fuelMinor = sumSurcharges(fuel, baseMinor, quantity, currency);
  const feesMinor = sumSurcharges(extra, baseMinor, quantity, currency);
  if (fuelMinor === null || feesMinor === null)
    return fail("currency_mismatch");
  return {
    ok: true,
    line: {
      baseMinor,
      fuelMinor,
      feesMinor,
      totalMinor: baseMinor + fuelMinor + feesMinor,
      transitDays: band.deliveryTime.maximumBusinessDays,
    },
  };
}
