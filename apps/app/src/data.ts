import type {
  PricingUnit,
  RoadPriceList,
  ZoneRange,
} from "@freight-desk/shared";

export type CarrierOffer = {
  id: string;
  name: string;
  price: number;
  deliveryDays: number;
  onTimeRate: number;
  invoiceAccuracy: number;
};

export type CarrierSubmission = RoadPriceList & {
  status: "new" | "downloaded";
  hasZoneWarning: boolean;
};

export const shipment = {
  origin: "8300 Odder",
  destination: "2680 Solrød Strand",
  goods: "6 paller · 2,4 LDM · 2.400 kg",
};

export const carrierOffers: CarrierOffer[] = [
  {
    name: "Transportør A",
    id: "carrier-a",
    price: 2180,
    deliveryDays: 1,
    onTimeRate: 94,
    invoiceAccuracy: 98,
  },
  {
    name: "Transportør B",
    id: "carrier-b",
    price: 1940,
    deliveryDays: 2,
    onTimeRate: 81,
    invoiceAccuracy: 93,
  },
  {
    name: "Transportør C",
    id: "carrier-c",
    price: 2350,
    deliveryDays: 1,
    onTimeRate: 97,
    invoiceAccuracy: 99,
  },
  {
    name: "Transportør D",
    id: "carrier-d",
    price: 2060,
    deliveryDays: 2,
    onTimeRate: 88,
    invoiceAccuracy: 95,
  },
];

const sampleZones: ZoneRange[] = [
  { from: "00", to: "26", name: "Zone 1" },
  { from: "30", to: "36", name: "Zone 2" },
  { from: "37", to: "39", name: "Zone 3" },
  { from: "40", to: "47", name: "Zone 4" },
];

const sampleBands = [
  { from: 1, to: 50, values: ["125,00", "140,00", "160,00", "185,00"] },
  { from: 51, to: 100, values: ["180,00", "200,00", "220,00", "245,00"] },
  { from: 101, to: 200, values: ["250,00", "275,00", "300,00", "330,00"] },
];

export const submittedCarriers: CarrierSubmission[] = [
  createSubmission(
    "11111111-1111-4111-8111-111111111111",
    "Transportør A",
    "KG",
    "2026-11-04T10:00:00.000Z",
    false,
  ),
  createSubmission(
    "22222222-2222-4222-8222-222222222222",
    "Transportør B",
    "PLL",
    "2026-11-05T10:00:00.000Z",
    false,
  ),
  createSubmission(
    "33333333-3333-4333-8333-333333333333",
    "Transportør C",
    "CBM",
    "2026-11-06T10:00:00.000Z",
    true,
  ),
  createSubmission(
    "44444444-4444-4444-8444-444444444444",
    "Transportør D",
    "LDM",
    "2026-11-07T10:00:00.000Z",
    false,
  ),
];

function createSubmission(
  id: string,
  carrierName: string,
  unit: PricingUnit,
  submittedAt: string,
  hasZoneWarning: boolean,
): CarrierSubmission {
  return {
    id,
    carrierName,
    unit,
    zones: sampleZones,
    priceBands: sampleBands,
    submittedAt,
    status: "new",
    hasZoneWarning,
  };
}

export function formatDkk(amount: number): string {
  return new Intl.NumberFormat("da-DK").format(amount);
}
