// The carrier's tariff while it is being edited, and how it becomes a shared Tariff.
// Everything typed in a box is kept as text; numbers are only read here, in one place.
// Not for prices: calculation lives in packages/shared/src/tariffs.

import {
  type MatrixImport,
  type PricingMethod,
  parseMinorUnits,
  type Tariff,
  type TariffZone,
} from "@freight-desk/shared";

export type ZoneRow = { id: string; name: string; from: string; to: string };

export type EditorState = {
  method: PricingMethod;
  zoneRows: ZoneRow[];
  // Upper limit of each bracket as typed. The last bracket is always open.
  limits: string[];
  rates: Record<string, string>;
  fuelPercent: string;
  minimumCharge: string;
  effectiveFrom: string;
  sourceFile: string | null;
};

export type TariffMeta = {
  tariffId: string;
  version: number;
  carrierOrganisationId: string;
  userId: string;
};

const POSTCODE_LENGTH = 4;
const BASIS_POINTS_PER_PERCENT = 100;
const DEFAULT_WEIGHT_LIMITS = ["50", "100", "200", "300", ""];

export const rateKey = (zoneId: string, bracketIndex: number) =>
  `${zoneId}|${bracketIndex}`;

export function newZoneRow(index: number): ZoneRow {
  return { id: crypto.randomUUID(), name: `Zone ${index}`, from: "", to: "" };
}

export function emptyState(today: string): EditorState {
  return {
    method: "per_100kg",
    zoneRows: [newZoneRow(1)],
    limits: [...DEFAULT_WEIGHT_LIMITS],
    rates: {},
    fuelPercent: "",
    minimumCharge: "",
    effectiveFrom: today,
    sourceFile: null,
  };
}

// Rows that share a name are one zone with several postcode ranges.
export function zonesFromRows(rows: readonly ZoneRow[]): TariffZone[] {
  const zones = new Map<string, TariffZone>();
  for (const row of rows) {
    const name = row.name.trim();
    const zone = zones.get(name) ?? { id: row.id, name, ranges: [] };
    zone.ranges.push({
      from: row.from.trim(),
      to: row.to.trim() || row.from.trim(),
    });
    zones.set(name, zone);
  }
  return [...zones.values()];
}

function percentToBasisPoints(text: string): number {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value > 0
    ? Math.round(value * BASIS_POINTS_PER_PERCENT)
    : 0;
}

export function toTariff(
  state: EditorState,
  meta: TariffMeta,
  now: string,
): Tariff {
  const zones = zonesFromRows(state.zoneRows);
  const limits = state.limits.map((text) =>
    text.trim() === "" ? null : Number(text.replace(",", ".")),
  );
  const brackets = limits.map((to, index) => ({
    from: index === 0 ? 0 : (limits[index - 1] ?? 0),
    to,
  }));
  const rates = zones.flatMap((zone) =>
    brackets.map((_, bracketIndex) => {
      const text = state.rates[rateKey(zone.id, bracketIndex)] ?? "";
      return {
        zoneId: zone.id,
        bracketIndex,
        amountMinor: text.trim() === "" ? null : parseMinorUnits(text),
      };
    }),
  );
  const fuel = percentToBasisPoints(state.fuelPercent);
  return {
    tariffId: meta.tariffId,
    version: meta.version,
    carrierOrganisationId: meta.carrierOrganisationId,
    status: "draft",
    currency: "DKK",
    method: state.method,
    postcodeLength: POSTCODE_LENGTH,
    effectiveFrom: state.effectiveFrom,
    effectiveTo: null,
    zones,
    brackets,
    rates,
    quantityStep: null,
    minimumChargeMinor: parseMinorUnits(state.minimumCharge),
    roundingStepMinor: 1,
    discounts: [],
    surcharges:
      fuel > 0
        ? [
            {
              name: "Fuel surcharge",
              kind: "fuel",
              calculation: { kind: "percentage", basisPoints: fuel },
            },
          ]
        : [],
    restrictions: {
      maxWeightKg: null,
      maxPallets: null,
      maxLoadingMeters: null,
      maxCubicMeters: null,
      originRanges: [],
    },
    sourceFile: state.sourceFile,
    createdAt: now,
    createdBy: meta.userId,
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
  };
}

const MINOR_PER_MAJOR = 100;

function minorToText(minor: number): string {
  return `${Math.trunc(minor / MINOR_PER_MAJOR)},${String(minor % MINOR_PER_MAJOR).padStart(2, "0")}`;
}

// Fills the editor from an imported rate sheet. Blank or unreadable cells stay blank.
export function applyImport(
  state: EditorState,
  grid: MatrixImport,
  fileName: string,
): EditorState {
  const zoneRows = grid.zones.flatMap((zone) =>
    (zone.ranges.length > 0 ? zone.ranges : [{ from: "", to: "" }]).map(
      (range, index) => ({
        id: index === 0 ? zone.id : crypto.randomUUID(),
        name: zone.name,
        from: range.from,
        to: range.to,
      }),
    ),
  );
  const rates: Record<string, string> = {};
  for (const rate of grid.rates) {
    if (rate.amountMinor !== null)
      rates[rateKey(rate.zoneId, rate.bracketIndex)] = minorToText(
        rate.amountMinor,
      );
  }
  return {
    ...state,
    method: grid.suggestedMethod ?? state.method,
    zoneRows,
    limits: grid.brackets.map((bracket) =>
      bracket.to === null ? "" : String(bracket.to),
    ),
    rates,
    sourceFile: fileName,
  };
}

export function stateFromTariff(tariff: Tariff): EditorState {
  const zoneRows = tariff.zones.flatMap((zone) =>
    zone.ranges.map((range, index) => ({
      id: index === 0 ? zone.id : crypto.randomUUID(),
      name: zone.name,
      from: range.from,
      to: range.to,
    })),
  );
  const rates: Record<string, string> = {};
  for (const rate of tariff.rates) {
    if (rate.amountMinor !== null) {
      rates[rateKey(rate.zoneId, rate.bracketIndex)] = minorToText(
        rate.amountMinor,
      );
    }
  }
  const fuel = tariff.surcharges.find(
    (item) => item.kind === "fuel" && item.calculation.kind === "percentage",
  );
  return {
    method: tariff.method,
    zoneRows,
    limits: tariff.brackets.map((bracket) =>
      bracket.to === null ? "" : String(bracket.to),
    ),
    rates,
    fuelPercent:
      fuel?.calculation.kind === "percentage"
        ? String(
            fuel.calculation.basisPoints / BASIS_POINTS_PER_PERCENT,
          ).replace(",", ".")
        : "",
    minimumCharge:
      tariff.minimumChargeMinor === null
        ? ""
        : minorToText(tariff.minimumChargeMinor),
    effectiveFrom: tariff.effectiveFrom,
    sourceFile: tariff.sourceFile,
  };
}
