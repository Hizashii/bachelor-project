// Suggests which spreadsheet column holds which shipment field, from header names.
// Deterministic synonym matching (Danish and English); no external services.
// A person can always correct the suggestion before processing.

import { z } from "zod";
import { type ShipmentField, shipmentFieldSchema } from "./fields.ts";

const MAX_COLUMN_INDEX = 199;

export const columnMappingSchema = z.partialRecord(
  shipmentFieldSchema,
  z.number().int().min(0).max(MAX_COLUMN_INDEX),
);

export type ColumnMapping = Partial<Record<ShipmentField, number>>;

export type MappingSuggestion = {
  mapping: ColumnMapping;
  uncertain: ShipmentField[];
};

const MIN_PARTIAL_MATCH_LENGTH = 4;

const SYNONYMS: Record<ShipmentField, readonly string[]> = {
  reference: [
    "reference",
    "shipmentreference",
    "forsendelsesnr",
    "sagsnr",
    "ref",
    "shipmentid",
    "ordrenr",
  ],
  carrier: ["carrier", "transportor", "vognmand", "transportfirma", "haulier"],
  originPostcode: [
    "originpostcode",
    "frapostnr",
    "afsenderpostnr",
    "frapostnummer",
    "originzip",
    "fromzip",
  ],
  destinationPostcode: [
    "destinationpostcode",
    "tilpostnr",
    "modtagerpostnr",
    "tilpostnummer",
    "destinationzip",
    "tozip",
  ],
  collectionAt: [
    "collectiondate",
    "afhentningsdato",
    "afhentning",
    "pickupdate",
    "afhentet",
  ],
  deliveryAt: [
    "deliverydate",
    "leveringsdato",
    "levering",
    "leveret",
    "delivered",
  ],
  weightKg: ["weight", "vaegt", "kg", "grossweight", "bruttovaegt"],
  pallets: ["pallets", "paller", "antalpaller", "pll", "pallet"],
  loadingMeters: [
    "loadingmetres",
    "loadingmeters",
    "ldm",
    "lastmeter",
    "lastmetre",
  ],
  cubicMeters: [
    "cubicmetres",
    "cubicmeters",
    "cbm",
    "m3",
    "kubikmeter",
    "volumen",
  ],
  packages: ["packages", "kolli", "antalkolli", "colli", "pieces", "pakker"],
  quotedCostMinor: [
    "freightcost",
    "fragtpris",
    "fragt",
    "pris",
    "price",
    "cost",
    "quotedprice",
  ],
  invoiceReference: [
    "invoicereference",
    "fakturanr",
    "fakturanummer",
    "invoiceno",
    "invoice",
    "faktura",
  ],
  trackingReference: [
    "trackingreference",
    "trackingnr",
    "trackingnummer",
    "tracking",
    "sporingsnr",
    "trackingid",
  ],
};

export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function suggestMapping(headers: readonly string[]): MappingSuggestion {
  const mapping: ColumnMapping = {};
  const uncertain: ShipmentField[] = [];
  const taken = new Set<number>();
  const normalised = headers.map(normaliseHeader);

  for (const [field, words] of Object.entries(SYNONYMS) as [
    ShipmentField,
    readonly string[],
  ][]) {
    const free = (index: number) => !taken.has(index);
    const exact = normalised.findIndex(
      (header, index) => free(index) && words.includes(header),
    );
    const partial = normalised.findIndex(
      (header, index) =>
        free(index) &&
        words.some(
          (word) =>
            word.length >= MIN_PARTIAL_MATCH_LENGTH && header.includes(word),
        ),
    );
    const index = exact >= 0 ? exact : partial;
    if (index < 0) continue;
    mapping[field] = index;
    taken.add(index);
    if (exact < 0) uncertain.push(field);
  }
  return { mapping, uncertain };
}
