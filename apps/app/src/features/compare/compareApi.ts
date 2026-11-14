// Server calls for the comparison screen. Prices are calculated by the server from each
// carrier's active tariff; the browser never calculates or stores a carrier price.

import type { PriceResult, PriceShipment } from "@freight-desk/shared";
import { apiFetch, postJson } from "../../api/client";

// Provided by the organisation work: carriers that can be compared and their tariff.
export type ComparableCarrier = {
  organisationId: string;
  name: string;
  tariffId: string;
};

export type CarrierPrice = {
  organisationId: string;
  tariffId: string;
  result: PriceResult | { status: "no_tariff" } | { status: "denied" };
};

export function fetchCarriers() {
  return apiFetch<ComparableCarrier[]>("/api/carriers");
}

export function priceCarriers(
  carriers: ComparableCarrier[],
  shipment: PriceShipment,
) {
  return postJson<CarrierPrice[]>("/api/pricing/compare", {
    carriers: carriers.map(({ organisationId, tariffId }) => ({
      organisationId,
      tariffId,
    })),
    shipment,
  });
}
