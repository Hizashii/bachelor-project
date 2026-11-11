// This file defines the approved carrier rate template: its id, version marker and columns.
// It does not read files; the server turns a file into text rows and passes them to buildBid.ts.

export const CARRIER_RATE_TEMPLATE_ID = "carrier-rate";
export const TEMPLATE_MARKER = "template";
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_COLUMNS = 32;
export const HEADER_ROW_NUMBER = 2;

export type ImportColumnKey =
  | "zoneCode"
  | "zoneName"
  | "originCountry"
  | "destinationCountry"
  | "originRanges"
  | "destinationRanges"
  | "unit"
  | "basis"
  | "from"
  | "to"
  | "price"
  | "currency"
  | "deliveryDays"
  | "surchargeName"
  | "surchargeType"
  | "surchargeValue";

export type ImportColumn = {
  key: ImportColumnKey;
  header: string;
  required: boolean;
  // Other accepted headers, compared after normalizeKey.
  aliases: string[];
};

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: "zoneCode",
    header: "Zone code",
    required: true,
    aliases: ["zonekode"],
  },
  {
    key: "zoneName",
    header: "Zone name",
    required: true,
    aliases: ["zonenavn"],
  },
  {
    key: "originCountry",
    header: "Origin country",
    required: true,
    aliases: ["afsenderland"],
  },
  {
    key: "destinationCountry",
    header: "Destination country",
    required: true,
    aliases: ["modtagerland"],
  },
  {
    key: "originRanges",
    header: "Origin ranges",
    required: false,
    aliases: ["afsenderomrader"],
  },
  {
    key: "destinationRanges",
    header: "Destination ranges",
    required: true,
    aliases: ["modtageromrader"],
  },
  { key: "unit", header: "Unit", required: true, aliases: ["enhed"] },
  {
    key: "basis",
    header: "Basis",
    required: true,
    aliases: ["beregningsgrundlag"],
  },
  { key: "from", header: "From", required: true, aliases: ["fra"] },
  { key: "to", header: "To", required: false, aliases: ["til"] },
  { key: "price", header: "Price", required: true, aliases: ["pris"] },
  { key: "currency", header: "Currency", required: true, aliases: ["valuta"] },
  {
    key: "deliveryDays",
    header: "Delivery days",
    required: true,
    aliases: ["leveringsdage"],
  },
  {
    key: "surchargeName",
    header: "Surcharge name",
    required: false,
    aliases: ["tillaegsnavn"],
  },
  {
    key: "surchargeType",
    header: "Surcharge type",
    required: false,
    aliases: ["tillaegstype"],
  },
  {
    key: "surchargeValue",
    header: "Surcharge value",
    required: false,
    aliases: ["tillaegsvaerdi"],
  },
];

export function templateMarkerText(version: string): string {
  return `${CARRIER_RATE_TEMPLATE_ID} ${version}`;
}
