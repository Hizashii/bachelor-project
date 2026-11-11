// Checks the carrier's own zones: usable coverage, unique codes, and no two zones
// that cover the same route (which would make a price ambiguous).
// It does not look at prices.

import type { CarrierZone } from "../contracts/offer.ts";
import type { OfferIssue } from "./validate.ts";

type Span = { from: number; to: number };

const POSTCODE_PREFIX_LENGTH = 2;

const spans = (ranges: CarrierZone["originRanges"]): Span[] =>
  ranges.map((r) => ({ from: Number(r.fromPrefix), to: Number(r.toPrefix) }));

const spansTouch = (a: Span[], b: Span[]): boolean =>
  a.some((x) => b.some((y) => x.from <= y.to && y.from <= x.to));

const normalize = (code: string): string =>
  code.replace(/\s+/g, "").toUpperCase();

function prefixOf(code: string): number | null {
  const head = normalize(code).slice(0, POSTCODE_PREFIX_LENGTH);
  return /^\d{2}$/.test(head) ? Number(head) : null;
}

function postcodeInSpans(code: string, list: Span[]): boolean {
  const prefix = prefixOf(code);
  return (
    prefix !== null && list.some((s) => s.from <= prefix && prefix <= s.to)
  );
}

function destinationsTouch(a: CarrierZone, b: CarrierZone): boolean {
  const aSpans = spans(a.destinationRanges);
  const bSpans = spans(b.destinationRanges);
  if (spansTouch(aSpans, bSpans)) return true;
  if (a.destinationPostcodes.some((c) => postcodeInSpans(c, bSpans)))
    return true;
  if (b.destinationPostcodes.some((c) => postcodeInSpans(c, aSpans)))
    return true;
  const bCodes = new Set(b.destinationPostcodes.map(normalize));
  return a.destinationPostcodes.some((c) => bCodes.has(normalize(c)));
}

// An empty origin list means the whole origin country.
function originsTouch(a: CarrierZone, b: CarrierZone): boolean {
  if (a.originRanges.length === 0 || b.originRanges.length === 0) return true;
  return spansTouch(spans(a.originRanges), spans(b.originRanges));
}

function sameRoute(a: CarrierZone, b: CarrierZone): boolean {
  return (
    a.originCountry === b.originCountry &&
    a.destinationCountry === b.destinationCountry
  );
}

function checkOne(zone: CarrierZone, index: number): OfferIssue[] {
  const path = `zones[${index}]`;
  const issues: OfferIssue[] = [];
  if (zone.destinationRanges.length + zone.destinationPostcodes.length === 0) {
    issues.push({
      path,
      code: "zone_empty",
      message: `Zone ${zone.name} covers no postcodes. Add a range or a postcode.`,
    });
  }
  if (zone.destinationPostcodes.some((c) => normalize(c) === "")) {
    issues.push({
      path: `${path}.destinationPostcodes`,
      code: "zone_bad_postcode",
      message: `Zone ${zone.name} has an empty postcode.`,
    });
  }
  return issues;
}

function checkPair(
  other: CarrierZone,
  zone: CarrierZone,
  index: number,
): OfferIssue[] {
  const issues: OfferIssue[] = [];
  if (other.code === zone.code) {
    issues.push({
      path: `zones[${index}].code`,
      code: "zone_duplicate_code",
      message: `Two zones use the code ${zone.code}. Give each zone its own code.`,
    });
  }
  if (
    sameRoute(other, zone) &&
    originsTouch(other, zone) &&
    destinationsTouch(other, zone)
  ) {
    issues.push({
      path: `zones[${index}]`,
      code: "zone_overlap",
      message: `Zones ${other.name} and ${zone.name} cover some of the same postcodes. A postcode may belong to one zone only.`,
    });
  }
  return issues;
}

export function checkZones(zones: CarrierZone[]): OfferIssue[] {
  const issues = zones.flatMap(checkOne);
  zones.forEach((zone, index) => {
    for (const other of zones.slice(0, index)) {
      issues.push(...checkPair(other, zone, index));
    }
  });
  return issues;
}
