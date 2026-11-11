// The comparison engine: turns a tender, its shipments and each carrier's effective offer into
// one ComparisonResult. Pure: no clock, no files, no network, no floats for money.
// It never prices an unmatched postcode, a missing rate or another currency as zero, and it
// never converts currencies. See price.ts for the pricing rules and rank.ts for ranking.
// A carrier is rankable when its offer passes validation, at least one shipment is priced and
// every shipment its zones match is priced. Uncovered shipments only lower its coverage.

import type {
  CarrierResult,
  ComparisonResult,
  IneligibleReason,
  ShipmentPrice,
} from "../contracts/comparison.ts";
import type { StoredBid } from "../contracts/offer.ts";
import { type OfferValidation, validateOffer } from "../offers/validate.ts";
import type { PostcodeZone, Shipment, Tender } from "../types/business.ts";
import { ratioBasisPoints } from "./money.ts";
import { priceLine } from "./price.ts";
import {
  cheapestBidVersionId,
  type Ranked,
  withWeightedScores,
} from "./rank.ts";
import { matchCarrierZone, matchesTenderZone } from "./zones.ts";

export type OfferValidator = (
  bid: StoredBid,
  tenderCurrency: string,
) => OfferValidation;

export type CompareInput = {
  tender: Pick<Tender, "id" | "currency" | "evaluation" | "zonePolicy">;
  shipments: readonly Shipment[];
  bids: readonly StoredBid[];
  tenderZones?: readonly PostcodeZone[];
  generatedAtUtc: string;
  validate?: OfferValidator;
};

type Line = { price: ShipmentPrice; transitDays: number | null };

const UNMATCHED: IneligibleReason[] = ["no_zone_match", "not_covered"];

function ineligible(
  shipmentId: string,
  reason: IneligibleReason,
  zoneCode: string | null,
): Line {
  const price: ShipmentPrice = {
    shipmentId,
    status: "ineligible",
    baseMinor: null,
    fuelMinor: null,
    feesMinor: null,
    totalMinor: null,
    zoneCode,
    reason,
  };
  return { price, transitDays: null };
}

function outsideCoverage(bid: StoredBid, shipment: Shipment, zoneId?: string) {
  const { countryCodes, zoneIds } = bid.serviceCoverage;
  const countries = [shipment.originCountry, shipment.destinationCountry];
  if (
    countryCodes.length &&
    !countries.every((c) => countryCodes.includes(c))
  ) {
    return true;
  }
  return Boolean(zoneId && zoneIds.length && !zoneIds.includes(zoneId));
}

function priceShipment(input: CompareInput, bid: StoredBid, s: Shipment): Line {
  const policy = input.tender.zonePolicy.overlapMode;
  const match = matchCarrierZone(s, bid.zones, policy);
  if (match.kind !== "matched") return ineligible(s.id, "no_zone_match", null);
  const { zone } = match;
  if (outsideCoverage(bid, s, zone.id)) {
    return ineligible(s.id, "not_covered", zone.code);
  }
  const result = priceLine(s.quantities, zone, bid, input.tender.currency);
  if (!result.ok) return ineligible(s.id, result.reason, zone.code);
  const { line } = result;
  const price: ShipmentPrice = {
    shipmentId: s.id,
    status: "priced",
    baseMinor: line.baseMinor,
    fuelMinor: line.fuelMinor,
    feesMinor: line.feesMinor,
    totalMinor: line.totalMinor,
    zoneCode: zone.code,
    reason: null,
  };
  return { price, transitDays: line.transitDays };
}

function linesFor(input: CompareInput, bid: StoredBid, ok: boolean): Line[] {
  return input.shipments.map((s) =>
    ok ? priceShipment(input, bid, s) : ineligible(s.id, "invalid_offer", null),
  );
}

function byZone(prices: readonly ShipmentPrice[]): CarrierResult["byZone"] {
  const zones = new Map<string, { shipments: number; totalMinor: number }>();
  for (const p of prices.filter((x) => x.status === "priced")) {
    const entry = zones.get(p.zoneCode ?? "") ?? {
      shipments: 0,
      totalMinor: 0,
    };
    entry.shipments += 1;
    entry.totalMinor += p.totalMinor ?? 0;
    zones.set(p.zoneCode ?? "", entry);
  }
  return [...zones].map(([zoneCode, v]) => ({ zoneCode, ...v }));
}

function carrierResult(input: CompareInput, bid: StoredBid): CarrierResult {
  const check = (input.validate ?? validateOffer)(bid, input.tender.currency);
  const lines = linesFor(input, bid, check.complete);
  const prices = lines.map((l) => l.price);
  const priced = prices.filter((p) => p.status === "priced");
  const matched = prices.filter(
    (p) => !UNMATCHED.includes(p.reason ?? "invalid_offer"),
  );
  const days = lines.flatMap((l) =>
    l.transitDays === null ? [] : [l.transitDays],
  );
  return {
    carrierCompanyId: bid.carrierCompanyId,
    bidVersionId: bid.id,
    versionNumber: bid.versionNumber,
    currency: input.tender.currency,
    rankable:
      check.complete &&
      priced.length > 0 &&
      matched.every((p) => p.status === "priced"),
    pricedShipments: priced.length,
    ineligibleShipments: prices.length - priced.length,
    coverageBasisPoints: ratioBasisPoints(priced.length, prices.length),
    totalMinor: priced.reduce((sum, p) => sum + (p.totalMinor ?? 0), 0),
    byZone: byZone(prices),
    shipments: prices,
    maxTransitDays: days.length ? Math.max(...days) : null,
    invalidReasons: check.complete ? [] : check.issues.map((i) => i.message),
    weightedScoreBasisPoints: null,
  };
}

// Shipments no tender zone covers. Without tender zones: shipments no carrier zone matched.
function unmatchedIds(input: CompareInput, results: CarrierResult[]): string[] {
  const zones = input.tenderZones ?? [];
  return input.shipments
    .filter((s) => {
      if (zones.length) return !matchesTenderZone(s, zones);
      return (
        results.length > 0 &&
        results.every((r) =>
          r.shipments.some(
            (p) => p.shipmentId === s.id && p.reason === "no_zone_match",
          ),
        )
      );
    })
    .map((s) => s.id);
}

export function compareBids(input: CompareInput): ComparisonResult {
  const base = input.bids.map((bid) => carrierResult(input, bid));
  const carriers = withWeightedScores(base, input.tender.evaluation);
  const ranked: Ranked[] = carriers.map((result, i) => ({
    result,
    submittedAtUtc: input.bids[i].submittedAtUtc ?? input.bids[i].createdAtUtc,
  }));
  return {
    tenderId: input.tender.id,
    generatedAtUtc: input.generatedAtUtc,
    currency: input.tender.currency,
    carriers,
    unmatchedShipmentIds: unmatchedIds(input, carriers),
    cheapestRankableBidVersionId: cheapestBidVersionId(ranked),
  };
}
