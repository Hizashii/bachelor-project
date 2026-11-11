// A plain summary of an offer for the preview screen: per zone, how many prices and the
// lowest and highest price. Pure; money stays in minor units and is formatted by screens.

import type { StoredBid } from "../contracts/offer.ts";

export type ZonePreview = {
  zoneId: string;
  code: string;
  name: string;
  bandCount: number;
  units: string[];
  lowestMinor: number | null;
  highestMinor: number | null;
  slowestDays: number | null;
};

export type OfferPreview = {
  currency: string | null;
  zones: ZonePreview[];
  surchargeCount: number;
  serviceDescription: string;
};

function previewZone(bid: StoredBid, zone: StoredBid["zones"][number]) {
  const bands = bid.rates.filter((r) => r.zoneId === zone.id);
  const prices = bands.map((b) => b.price.amountMinor);
  const days = bands.map((b) => b.deliveryTime.maximumBusinessDays);
  return {
    zoneId: zone.id,
    code: zone.code,
    name: zone.name,
    bandCount: bands.length,
    units: [...new Set(bands.map((b) => b.unit))],
    lowestMinor: prices.length ? Math.min(...prices) : null,
    highestMinor: prices.length ? Math.max(...prices) : null,
    slowestDays: days.length ? Math.max(...days) : null,
  };
}

export function previewOffer(bid: StoredBid): OfferPreview {
  return {
    currency: bid.rates[0]?.price.currency ?? null,
    zones: bid.zones.map((zone) => previewZone(bid, zone)),
    surchargeCount: bid.surcharges.length,
    serviceDescription: bid.notes.serviceDescription,
  };
}
