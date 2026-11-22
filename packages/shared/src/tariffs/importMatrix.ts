// Reads a carrier rate sheet laid out as a grid: zones across the top, quantity brackets
// down the side, rates in the cells. Anything unclear is returned as an ambiguity for a
// person to confirm; nothing is guessed and no formula is evaluated.
// This layout is a general one, not S&A's own template: it still has to be checked
// against a real carrier workbook before it is trusted for production tariffs.

import {
  cellText,
  parseDecimal,
  parseMinorUnits,
  type RawCell,
} from "../shipments/clean.ts";
import type {
  Bracket,
  PricingMethod,
  TariffPostcodeRange,
  TariffZone,
} from "./tariff.ts";

export type ImportAmbiguity = {
  row: number;
  column: number;
  code:
    | "blank_rate"
    | "unreadable_rate"
    | "unreadable_bracket"
    | "no_postcode_range";
  text: string;
};

export type MatrixImport = {
  suggestedMethod: PricingMethod | null;
  zones: TariffZone[];
  brackets: Bracket[];
  rates: { zoneId: string; bracketIndex: number; amountMinor: number | null }[];
  ambiguities: ImportAmbiguity[];
};

const METHOD_HINTS: [RegExp, PricingMethod][] = [
  [/100\s*kg/i, "per_100kg"],
  [/pall?et|pll/i, "per_pallet"],
  [/ldm|loading\s*met|lastmeter/i, "per_ldm"],
  [/cbm|m3|m³|kubik/i, "per_cbm"],
];

export function suggestMethod(label: string): PricingMethod | null {
  return METHOD_HINTS.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}

function parseRanges(text: string): TariffPostcodeRange[] {
  const ranges: TariffPostcodeRange[] = [];
  for (const [, from = "", to = ""] of text.matchAll(
    /(\d{2,4})\s*[-–]\s*(\d{2,4})/g,
  )) {
    ranges.push({ from, to });
  }
  return ranges;
}

// "0-100", "100" or "200+" give the upper limit; the lower limit is the previous bracket.
function parseUpperLimit(cell: RawCell): number | null | undefined {
  const text = cellText(cell);
  if (/^(>\s*)?\d+([.,]\d+)?\s*\+?$/.test(text) && /\+|>/.test(text))
    return null;
  const range = /^\d+([.,]\d+)?\s*[-–]\s*(\d+([.,]\d+)?)$/.exec(text);
  const value = parseDecimal(range ? range[2] : text);
  return value === null ? undefined : value;
}

export function importRateMatrix(rows: readonly RawCell[][]): MatrixImport {
  const [header = [], ...body] = rows;
  const zones = header.slice(1).map(
    (cell, index): TariffZone => ({
      id: `zone-${index + 1}`,
      name:
        cellText(cell)
          .replace(/\(.*\)/, "")
          .trim() || `Zone ${index + 1}`,
      ranges: parseRanges(cellText(cell)),
    }),
  );
  const result: MatrixImport = {
    suggestedMethod: suggestMethod(cellText(header[0])),
    zones,
    brackets: [],
    rates: [],
    ambiguities: [],
  };
  zones.forEach((zone, index) => {
    if (zone.ranges.length === 0) {
      result.ambiguities.push({
        row: 1,
        column: index + 2,
        code: "no_postcode_range",
        text: zone.name,
      });
    }
  });
  for (const [index, row] of body.entries()) {
    readBracketRow(result, row, index + 2);
  }
  return result;
}

function readBracketRow(
  result: MatrixImport,
  row: readonly RawCell[],
  rowNumber: number,
): void {
  if (row.every((cell) => cellText(cell) === "")) return;
  const upper = parseUpperLimit(row[0]);
  if (upper === undefined) {
    result.ambiguities.push({
      row: rowNumber,
      column: 1,
      code: "unreadable_bracket",
      text: cellText(row[0]),
    });
    return;
  }
  const from = result.brackets.at(-1)?.to ?? 0;
  const bracketIndex = result.brackets.length;
  result.brackets.push({ from: from ?? 0, to: upper });
  result.zones.forEach((zone, zoneIndex) => {
    const cell = row[zoneIndex + 1];
    const amountMinor = cellText(cell) === "" ? null : parseMinorUnits(cell);
    if (amountMinor === null) {
      const code = cellText(cell) === "" ? "blank_rate" : "unreadable_rate";
      result.ambiguities.push({
        row: rowNumber,
        column: zoneIndex + 2,
        code,
        text: cellText(cell),
      });
    }
    result.rates.push({ zoneId: zone.id, bracketIndex, amountMinor });
  });
}
