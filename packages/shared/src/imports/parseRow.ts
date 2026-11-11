// This file checks one data row of the rate file and turns it into a rate band, a zone
// description and an optional surcharge. Problems come back as plain sentences with the row number.

import type { CarrierZone } from "../contracts/offer.ts";
import type { RateBand, Surcharge } from "../types/business.ts";
import type { Cells, ImportIssue } from "./columns.ts";
import {
  parseBasis,
  parseDeliveryDays,
  parseMinor,
  parseQuantity,
  parseRanges,
  parseUnit,
  safeText,
} from "./normalize.ts";

type Zone = Omit<CarrierZone, "id">;
type Band = Omit<RateBand, "id" | "zoneId" | "dataVersion">;
export type SurchargeCore = Pick<Surcharge, "name" | "kind" | "calculation">;
export type ParsedRow = {
  row: number;
  zone: Zone;
  band: Band;
  surcharge: SurchargeCore | null;
};

const COUNTRY = /^[A-Z]{2}$/;
const MAX_BASIS_POINTS = 10_000;
const SURCHARGE_KINDS: Record<string, "fuel" | "additional"> = {
  fuel: "fuel",
  braendstof: "fuel",
  additional: "additional",
  tillaeg: "additional",
};

function parseSurcharge(
  cells: Cells,
  currency: string,
): SurchargeCore | string | null {
  if (cells.surchargeName === "") return null;
  const typeKey = cells.surchargeType.toLowerCase().replace(/æ/g, "ae");
  const kind = SURCHARGE_KINDS[typeKey];
  if (!kind) return "Surcharge type must be fuel or additional.";
  const value = cells.surchargeValue;
  const name = safeText(cells.surchargeName);
  if (value.endsWith("%")) {
    const basisPoints = parseMinor(value.slice(0, -1));
    if (basisPoints === null || basisPoints > MAX_BASIS_POINTS) {
      return "Surcharge percentage is not valid.";
    }
    return { name, kind, calculation: { kind: "percentage", basisPoints } };
  }
  const amountMinor = parseMinor(value);
  if (amountMinor === null) {
    return "Surcharge value is not valid. Use 12% or an amount.";
  }
  return {
    name,
    kind,
    calculation: { kind: "fixed", amount: { amountMinor, currency } },
  };
}

function parseZone(cells: Cells): Zone | string {
  if (cells.zoneCode === "" || cells.zoneName === "") {
    return "Zone code and zone name are required.";
  }
  const destinationRanges = parseRanges(cells.destinationRanges);
  const originRanges =
    cells.originRanges === "" ? [] : parseRanges(cells.originRanges);
  if (!destinationRanges) {
    return "Destination ranges must look like 00-26; 30-36.";
  }
  if (!originRanges) return "Origin ranges must look like 00-26; 30-36.";
  if (
    !COUNTRY.test(cells.originCountry) ||
    !COUNTRY.test(cells.destinationCountry)
  ) {
    return "Countries must be two capital letters, for example DK.";
  }
  return {
    code: safeText(cells.zoneCode),
    name: safeText(cells.zoneName),
    originCountry: cells.originCountry,
    destinationCountry: cells.destinationCountry,
    originRanges,
    destinationRanges,
    destinationPostcodes: [],
  };
}

function parseBand(cells: Cells, currency: string): Band | string {
  const unit = parseUnit(cells.unit);
  const basis = parseBasis(cells.basis);
  const fromQuantity = parseQuantity(cells.from);
  const toQuantity = cells.to === "" ? null : parseQuantity(cells.to);
  const amountMinor = parseMinor(cells.price);
  const deliveryTime = parseDeliveryDays(cells.deliveryDays);
  if (!unit)
    return "Unit is not one we know (kg, pallets, CBM, LDM, packages).";
  if (!basis) return "Basis is not one we know, for example per shipment.";
  if (fromQuantity === null) return "From is not a valid number.";
  if (toQuantity === null && cells.to !== "")
    return "To is not a valid number.";
  if (toQuantity !== null && toQuantity < fromQuantity) {
    return "To must not be lower than From.";
  }
  if (amountMinor === null) return "Price is not a valid amount.";
  if (cells.currency !== currency) {
    return `Currency must be ${currency} for this tender.`;
  }
  if (!deliveryTime) return "Delivery days must look like 2 or 1-2.";
  return {
    unit: unit as Band["unit"],
    basis: basis as Band["basis"],
    fromQuantity,
    toQuantity,
    price: { amountMinor, currency },
    deliveryTime,
  };
}

export function parseRow(
  cells: Cells,
  row: number,
  currency: string,
): { row: ParsedRow | null; issues: ImportIssue[] } {
  const zone = parseZone(cells);
  const band = parseBand(cells, currency);
  const surcharge = parseSurcharge(cells, currency);
  if (typeof zone === "string" || typeof band === "string") {
    const messages = [zone, band].filter((part) => typeof part === "string");
    return { row: null, issues: messages.map((message) => ({ row, message })) };
  }
  if (typeof surcharge === "string") {
    return { row: null, issues: [{ row, message: surcharge }] };
  }
  return { row: { row, zone, band, surcharge }, issues: [] };
}
