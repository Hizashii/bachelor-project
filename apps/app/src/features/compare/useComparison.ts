// Loads the carriers, asks the server to price a shipment with each one, and merges in
// delivery reliability when a provider has it. Reliability is never invented.

import type { PriceShipment } from "@freight-desk/shared";
import { useState } from "react";
import { fetchCarriers, priceCarriers } from "./compareApi";
import type { OfferLine } from "./OfferTable";
import { noReliabilityData, type ReliabilityProvider } from "./reliability";

export function useComparison(
  reliability: ReliabilityProvider = noReliabilityData,
) {
  const [lines, setLines] = useState<OfferLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compare(shipment: PriceShipment) {
    setBusy(true);
    setError(null);
    try {
      const carriers = await fetchCarriers();
      const ids = carriers.map((carrier) => carrier.organisationId);
      const [prices, stats] = await Promise.all([
        priceCarriers(carriers, shipment),
        reliability.forCarriers(ids),
      ]);
      setLines(
        carriers.map((carrier) => ({
          carrier,
          price: prices.find(
            (price) => price.organisationId === carrier.organisationId,
          )?.result ?? { status: "no_tariff" },
          reliability:
            stats.find(
              (item) => item.carrierOrganisationId === carrier.organisationId,
            ) ?? null,
        })),
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  return { lines, busy, error, compare };
}
