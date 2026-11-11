// This file turns the text rows of an approved carrier rate file into a StoredBid.
// Row 1 holds the template marker, row 2 the headers, rows 3+ one rate band each.
// It reports every problem with its row number and a plain sentence. It reads no files.

import { type StoredBid, storedBidSchema } from "../contracts/offer.ts";
import type { ExcelTemplate, VatTreatment } from "../types/business.ts";
import {
  type ImportIssue,
  mapColumns,
  readCells,
  readMarker,
} from "./columns.ts";
import { type ParsedRow, parseRow } from "./parseRow.ts";

export type { ImportIssue } from "./columns.ts";

export type BuildContext = {
  tender: {
    currency: string;
    vatTreatment: VatTreatment;
    carrierRateTemplate: ExcelTemplate;
  };
  base: {
    id: string;
    tenderId: string;
    carrierCompanyId: string;
    createdByUserId: string;
    versionNumber: number;
    createdAtUtc: string;
  };
  newId: () => string;
};

export type BuildResult = { bid: StoredBid | null; issues: ImportIssue[] };

type Zone = StoredBid["zones"][number];
type Surcharge = StoredBid["surcharges"][number];

function collectRows(rows: string[][], currency: string) {
  const { index, issues } = mapColumns(rows[1] ?? []);
  const parsed: ParsedRow[] = [];
  if (issues.length > 0) return { parsed, issues };
  for (const [offset, row] of rows.slice(2).entries()) {
    const cells = readCells(row, index);
    if (Object.values(cells).every((cell) => cell === "")) continue;
    const result = parseRow(cells, offset + 3, currency);
    issues.push(...result.issues);
    if (result.row) parsed.push(result.row);
  }
  return { parsed, issues };
}

export function buildBidFromRows(
  rows: string[][],
  ctx: BuildContext,
): BuildResult {
  const version = ctx.tender.carrierRateTemplate.version;
  const marker = readMarker(rows[0] ?? [], version);
  if (marker.length > 0) return { bid: null, issues: marker };
  const { parsed, issues } = collectRows(rows, ctx.tender.currency);
  if (issues.length > 0) return { bid: null, issues };
  if (parsed.length === 0) {
    const issue = { row: 0, message: "The file has no rate rows." };
    return { bid: null, issues: [issue] };
  }
  return assemble(parsed, ctx);
}

function sameZone(a: Zone, b: ParsedRow["zone"]): boolean {
  const pick = (z: ParsedRow["zone"]) =>
    JSON.stringify([
      z.name,
      z.originCountry,
      z.destinationCountry,
      z.originRanges,
      z.destinationRanges,
    ]);
  return pick(a) === pick(b);
}

function addSurcharge(
  surcharges: Map<string, Surcharge>,
  item: ParsedRow,
  ctx: BuildContext,
): string | null {
  if (!item.surcharge) return null;
  const key = item.surcharge.name.toLowerCase();
  const known = surcharges.get(key);
  const next: Surcharge = {
    id: known?.id ?? ctx.newId(),
    appliesTo: "shipment",
    vatTreatment: ctx.tender.vatTreatment,
    ...item.surcharge,
  };
  if (known && JSON.stringify(next) !== JSON.stringify(known)) {
    return `Surcharge ${item.surcharge.name} has different values on another row.`;
  }
  surcharges.set(key, next);
  return null;
}

function assemble(parsed: ParsedRow[], ctx: BuildContext): BuildResult {
  const issues: ImportIssue[] = [];
  const zones = new Map<string, Zone>();
  const surcharges = new Map<string, Surcharge>();
  const rates: StoredBid["rates"] = [];
  for (const item of parsed) {
    const key = item.zone.code.toLowerCase();
    const known = zones.get(key);
    const clash = known && !sameZone(known, item.zone);
    const message = clash
      ? `Zone ${item.zone.code} is described differently on another row.`
      : addSurcharge(surcharges, item, ctx);
    if (message) {
      issues.push({ row: item.row, message });
      continue;
    }
    const zone = known ?? { id: ctx.newId(), ...item.zone };
    zones.set(key, zone);
    rates.push({
      id: ctx.newId(),
      zoneId: zone.id,
      ...item.band,
      dataVersion: 1,
    });
  }
  if (issues.length > 0) return { bid: null, issues };
  return finish([...zones.values()], [...surcharges.values()], rates, ctx);
}

function finish(
  zones: Zone[],
  surcharges: Surcharge[],
  rates: StoredBid["rates"],
  ctx: BuildContext,
): BuildResult {
  const candidate = {
    ...ctx.base,
    state: "draft",
    rates,
    surcharges,
    serviceCoverage: {
      countryCodes: [...new Set(zones.map((zone) => zone.destinationCountry))],
      zoneIds: zones.map((zone) => zone.id),
      notes: "",
    },
    submittedAtUtc: null,
    supersedesVersionId: null,
    withdrawnAtUtc: null,
    sourceTemplate: ctx.tender.carrierRateTemplate,
    zones,
    notes: {
      serviceDescription: "",
      supportedUnits: [...new Set(rates.map((rate) => rate.unit))],
      minimumChargeMinor: null,
    },
  };
  const checked = storedBidSchema.safeParse(candidate);
  if (checked.success) return { bid: checked.data, issues: [] };
  const issue = {
    row: 0,
    message: "The file could not be turned into an offer.",
  };
  return { bid: null, issues: [issue] };
}
