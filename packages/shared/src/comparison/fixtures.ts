// Small builders for comparison tests. Ids are readable numbers turned into uuids.

import type { StoredBid } from "../contracts/offer.ts";
import type { Shipment, Surcharge, TransportUnit } from "../types/business.ts";
import type { CompareInput } from "./compare.ts";

export const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const START = "2027-01-01T00:00:00Z";

export const tender: CompareInput["tender"] = {
  id: uid(1),
  currency: "DKK",
  evaluation: {
    mode: "cheapest_eligible",
    criteria: [{ kind: "price", weightBasisPoints: 10_000 }],
  },
  zonePolicy: { overlapMode: "reject", unmatchedPostcodesBlockAward: false },
};

export const kg = (value: number): Shipment["quantities"] => [
  { unit: "kg", value },
];

export function shipment(
  n: number,
  destinationPostcode: string,
  quantities: Shipment["quantities"],
): Shipment {
  return {
    id: uid(100 + n),
    tenderId: uid(1),
    sequence: n,
    originPostcode: "8300",
    destinationPostcode,
    originCountry: "DK",
    destinationCountry: "DK",
    quantities,
    originZoneId: null,
    destinationZoneId: null,
    sourceRowNumber: n,
    dataVersion: 1,
  };
}

export function zone(
  n: number,
  code: string,
  from: string,
  to: string,
): StoredBid["zones"][number] {
  return {
    id: uid(200 + n),
    code,
    name: code,
    originCountry: "DK",
    destinationCountry: "DK",
    originRanges: [],
    destinationRanges: [{ fromPrefix: from, toPrefix: to, priority: 1 }],
    destinationPostcodes: [],
  };
}

type BandOptions = { unit?: TransportUnit; currency?: string; days?: number };

export function band(
  zoneN: number,
  basis: StoredBid["rates"][number]["basis"],
  from: number,
  to: number | null,
  amountMinor: number,
  options: BandOptions = {},
): StoredBid["rates"][number] {
  return {
    id: uid(300 + Math.round(from) + amountMinor),
    zoneId: uid(200 + zoneN),
    unit: options.unit ?? "kg",
    basis,
    fromQuantity: from,
    toQuantity: to,
    price: { amountMinor, currency: options.currency ?? "DKK" },
    deliveryTime: {
      minimumBusinessDays: 1,
      maximumBusinessDays: options.days ?? 2,
    },
    dataVersion: 1,
  };
}

export function fee(
  kind: Surcharge["kind"],
  calculation: Surcharge["calculation"],
  appliesTo: Surcharge["appliesTo"] = "shipment",
): Surcharge {
  return {
    id: uid(400),
    name: "fee",
    kind,
    calculation,
    appliesTo,
    vatTreatment: "excluded",
  };
}

type BidParts = Partial<Pick<StoredBid, "zones" | "rates" | "surcharges">> & {
  minimumChargeMinor?: number;
  submittedAtUtc?: string;
  units?: TransportUnit[];
};

export function bid(n: number, parts: BidParts): StoredBid {
  return {
    id: uid(500 + n),
    tenderId: uid(1),
    carrierCompanyId: uid(600 + n),
    createdByUserId: uid(700),
    versionNumber: 1,
    state: "submitted",
    rates: parts.rates ?? [],
    surcharges: parts.surcharges ?? [],
    serviceCoverage: { countryCodes: [], zoneIds: [], notes: "" },
    createdAtUtc: START,
    submittedAtUtc: parts.submittedAtUtc ?? START,
    supersedesVersionId: null,
    withdrawnAtUtc: null,
    sourceTemplate: null,
    zones: parts.zones ?? [],
    notes: {
      serviceDescription: "",
      supportedUnits: parts.units ?? ["kg"],
      minimumChargeMinor: parts.minimumChargeMinor ?? null,
    },
  };
}

export const valid = () => ({ complete: true, issues: [] });
