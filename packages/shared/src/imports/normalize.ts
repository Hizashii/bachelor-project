// This file turns free cell text into exact values: numbers, money in minor units, units,
// bases, postcode ranges and delivery days. Each function returns null when the text is not valid.
// It never evaluates anything; text is only read.

import type { PostcodeRange } from "../types/business.ts";

const UNITS: Record<string, string> = {
  kg: "kg",
  pallets: "pallets",
  pallet: "pallets",
  paller: "pallets",
  palle: "pallets",
  cbm: "CBM",
  m3: "CBM",
  ldm: "LDM",
  packages: "packages",
  package: "packages",
  pakker: "packages",
  pakke: "packages",
  colli: "packages",
};

const BASES: Record<string, string> = {
  pershipment: "per_shipment",
  forsendelse: "per_shipment",
  perkg: "per_kg",
  per100kg: "per_100kg",
  perpallet: "per_pallet",
  percbm: "per_cbm",
  perldm: "per_ldm",
  perpackage: "per_package",
};

const MAX_FRACTION_DIGITS = 2;
const MINOR_PER_UNIT = 100;
const AMBIGUOUS_GROUP_DIGITS = 3;

export function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]/g, "");
}

// Text that could be run as a formula by a spreadsheet gets a leading apostrophe.
export function safeText(text: string): string {
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function isGroupedWhole(value: string, separator: string): string | null {
  const groups = value.split(separator);
  const first = groups[0] as string;
  const grouped =
    /^d{1,3}$/.test(first) &&
    groups.slice(1).every((group) => /^d{3}$/.test(group));
  return grouped ? groups.join("") : null;
}

// Returns a plain "1234.56" string, or null. A single separator is always a decimal point,
// except exactly three digits after it ("1.234"), which is ambiguous and refused.
export function plainDecimal(text: string): string | null {
  const value = text.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const last = Math.max(lastComma, lastDot);
  if (last < 0) return value;
  const separator = value[last] as string;
  const other = separator === "," ? "." : ",";
  const head = value.slice(0, last);
  const tail = value.slice(last + 1);
  const repeated = head.includes(separator);
  if (repeated) return isGroupedWhole(value, separator);
  if (!/^\d+$/.test(tail)) return null;
  if (tail.length === AMBIGUOUS_GROUP_DIGITS && !head.includes(other)) {
    return null;
  }
  return `${head.replaceAll(other, "")}.${tail}`;
}

export function parseQuantity(text: string): number | null {
  const plain = plainDecimal(text);
  return plain === null ? null : Number(plain);
}

// Hundredths of the main unit: money minor units, or percent as basis points.
export function parseMinor(text: string): number | null {
  const plain = plainDecimal(text);
  if (plain === null) return null;
  const [whole = "", fraction = ""] = plain.split(".");
  if (fraction.length > MAX_FRACTION_DIGITS) return null;
  const minor =
    Number(whole) * MINOR_PER_UNIT +
    Number(fraction.padEnd(MAX_FRACTION_DIGITS, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function parseUnit(text: string): string | null {
  return UNITS[normalizeKey(text)] ?? null;
}

export function parseBasis(text: string): string | null {
  return BASES[normalizeKey(text)] ?? null;
}

// "00-26; 30-36" or "47". Priority follows the order written.
export function parseRanges(text: string): PostcodeRange[] | null {
  const parts = text.split(/[;,]/).map((part) => part.trim());
  const ranges: PostcodeRange[] = [];
  for (const [priority, part] of parts.entries()) {
    const match = /^(\d{2})(?:\s*-\s*(\d{2}))?$/.exec(part);
    if (!match) return null;
    const fromPrefix = match[1] as string;
    const toPrefix = match[2] ?? fromPrefix;
    if (Number(fromPrefix) > Number(toPrefix)) return null;
    ranges.push({ fromPrefix, toPrefix, priority });
  }
  return ranges;
}

export function parseDeliveryDays(
  text: string,
): { minimumBusinessDays: number; maximumBusinessDays: number } | null {
  const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const minimum = Number(match[1]);
  const maximum = Number(match[2] ?? match[1]);
  if (minimum > maximum) return null;
  return { minimumBusinessDays: minimum, maximumBusinessDays: maximum };
}
