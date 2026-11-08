import type { ZoneRange } from "../schemas/road.ts";

export type { ZoneRange } from "../schemas/road.ts";

export type ZoneValidation = {
  valid: boolean;
  noOverlaps: boolean;
  validRanges: boolean;
  allMapped: boolean;
};

export function validateZoneRanges(
  zones: readonly ZoneRange[],
): ZoneValidation {
  const parsed = zones.map(parseZoneRange);
  const validRanges = parsed.every((zone) => zone !== null);
  const allMapped = zones.every(
    (zone) => zone.from.trim() !== "" && zone.name.trim() !== "",
  );
  const noOverlaps = validRanges && hasNoOverlaps(parsed);

  return {
    valid: validRanges && allMapped && noOverlaps,
    noOverlaps,
    validRanges,
    allMapped,
  };
}

export function findZoneForPostcode(
  postcode: string,
  zones: readonly ZoneRange[],
): string | null {
  const prefix = Number(postcode.trim().slice(0, 2));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 99) return null;

  const match = zones.find((zone) => {
    const parsed = parseZoneRange(zone);
    return parsed !== null && prefix >= parsed.from && prefix <= parsed.to;
  });
  return match?.name.trim() || null;
}

function parseZoneRange(zone: ZoneRange): { from: number; to: number } | null {
  const from = parsePrefix(zone.from);
  const to = zone.to.trim() === "" ? from : parsePrefix(zone.to);
  if (from === null || to === null || from > to || zone.name.trim() === "") {
    return null;
  }
  return { from, to };
}

function parsePrefix(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const prefix = Number(value);
  return prefix >= 0 && prefix <= 99 ? prefix : null;
}

function hasNoOverlaps(
  zones: readonly ({ from: number; to: number } | null)[],
): boolean {
  const valid = zones.filter(
    (zone): zone is { from: number; to: number } => zone !== null,
  );
  return valid.every((zone, index) =>
    valid.slice(index + 1).every((other) => {
      return zone.to < other.from || other.to < zone.from;
    }),
  );
}
