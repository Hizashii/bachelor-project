// Matches a shipment to a carrier's own zone by country, postcode prefix and explicit postcodes.
// Prefixes are the first two digits of a postcode. It does not price anything.

import type { CarrierZone } from "../contracts/offer.ts";
import type {
  PostcodeRange,
  PostcodeZone,
  Shipment,
  Tender,
} from "../types/business.ts";

export type ZoneMatch =
  | { kind: "matched"; zone: CarrierZone }
  | { kind: "none" }
  | { kind: "ambiguous" };

const EXPLICIT_PRIORITY = 0;
const PREFIX_LENGTH = 2;

function normalise(postcode: string): string {
  return postcode.replace(/\s+/g, "").toUpperCase();
}

function prefixOf(postcode: string): number | null {
  const head = normalise(postcode).slice(0, PREFIX_LENGTH);
  return /^\d{2}$/.test(head) ? Number(head) : null;
}

// Best (lowest) priority of a range that holds the postcode, or null when none does.
function rangePriority(
  postcode: string,
  ranges: readonly PostcodeRange[],
): number | null {
  const prefix = prefixOf(postcode);
  if (prefix === null) return null;
  const hits = ranges.filter(
    (r) => prefix >= Number(r.fromPrefix) && prefix <= Number(r.toPrefix),
  );
  return hits.length ? Math.min(...hits.map((r) => r.priority)) : null;
}

// An empty origin list means "any origin". Returns the priority of the hit or null.
function originPriority(zone: CarrierZone, postcode: string): number | null {
  if (zone.originRanges.length === 0) return EXPLICIT_PRIORITY;
  return rangePriority(postcode, zone.originRanges);
}

function destinationPriority(
  zone: CarrierZone,
  postcode: string,
): number | null {
  const { destinationRanges, destinationPostcodes } = zone;
  if (destinationRanges.length === 0 && destinationPostcodes.length === 0) {
    return EXPLICIT_PRIORITY;
  }
  const wanted = normalise(postcode);
  if (destinationPostcodes.some((p) => normalise(p) === wanted)) {
    return EXPLICIT_PRIORITY;
  }
  return rangePriority(postcode, destinationRanges);
}

function zonePriority(zone: CarrierZone, shipment: Shipment): number | null {
  if (zone.originCountry !== shipment.originCountry) return null;
  if (zone.destinationCountry !== shipment.destinationCountry) return null;
  const origin = originPriority(zone, shipment.originPostcode);
  const destination = destinationPriority(zone, shipment.destinationPostcode);
  if (origin === null || destination === null) return null;
  return origin + destination;
}

// Several matching zones: "priority" mode takes the lowest priority number, "reject" mode
// refuses to guess. A tie in priority is always ambiguous and never priced.
export function matchCarrierZone(
  shipment: Shipment,
  zones: readonly CarrierZone[],
  overlapMode: Tender["zonePolicy"]["overlapMode"],
): ZoneMatch {
  const hits = zones
    .map((zone) => ({ zone, priority: zonePriority(zone, shipment) }))
    .filter((hit): hit is { zone: CarrierZone; priority: number } => {
      return hit.priority !== null;
    });
  if (hits.length === 0) return { kind: "none" };
  if (hits.length === 1) return { kind: "matched", zone: hits[0].zone };
  if (overlapMode === "reject") return { kind: "ambiguous" };
  const best = Math.min(...hits.map((hit) => hit.priority));
  const top = hits.filter((hit) => hit.priority === best);
  return top.length === 1
    ? { kind: "matched", zone: top[0].zone }
    : { kind: "ambiguous" };
}

// True when a tender-level zone holds the shipment's destination postcode.
export function matchesTenderZone(
  shipment: Shipment,
  tenderZones: readonly PostcodeZone[],
): boolean {
  return tenderZones.some(
    (zone) => rangePriority(shipment.destinationPostcode, zone.ranges) !== null,
  );
}
