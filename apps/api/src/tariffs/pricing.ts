// Prices one shipment with each carrier's tariff for the comparison screen.
// A carrier with no usable tariff is reported as such, never as a made-up price.
// Not for editing tariffs: see service.ts.

import {
  calculatePrice,
  type PriceResult,
  type PriceShipment,
  selectVersion,
} from "@freight-desk/shared";
import type { AccessContext, PermissionChecker } from "../auth/permissions.ts";
import type { TariffService } from "./service.ts";

export type CarrierRef = { organisationId: string };

export type PriceOutcome =
  | PriceResult
  | { status: "no_tariff" }
  | { status: "denied" }
  | { status: "error" };

export type CarrierPrice = CarrierRef & { result: PriceOutcome };

type Dependencies = { tariffs: TariffService; permissions: PermissionChecker };

export class PricingService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  async priceCarriers(
    context: AccessContext,
    carriers: readonly CarrierRef[],
    shipment: PriceShipment,
  ): Promise<CarrierPrice[]> {
    return Promise.all(
      carriers.map(async (carrier) => ({
        ...carrier,
        result: await this.priceOne(context, carrier, shipment),
      })),
    );
  }

  // A carrier may have several tariffs; the cheapest one that prices the shipment counts.
  private async priceOne(
    context: AccessContext,
    carrier: CarrierRef,
    shipment: PriceShipment,
  ): Promise<PriceOutcome> {
    const resource = { organisationId: carrier.organisationId };
    if (!this.deps.permissions.can(context, "price:calculate", resource)) {
      return { status: "denied" };
    }
    try {
      const results = await this.priceEveryTariff(context, carrier, shipment);
      return cheapestOf(results) ?? { status: "no_tariff" };
    } catch {
      // One carrier's unreadable tariff must not stop the others from being priced.
      return { status: "error" };
    }
  }

  private async priceEveryTariff(
    context: AccessContext,
    carrier: CarrierRef,
    shipment: PriceShipment,
  ): Promise<PriceResult[]> {
    const tariffs = await this.deps.tariffs.listCarrierTariffs(context, [
      carrier.organisationId,
    ]);
    const results: PriceResult[] = [];
    for (const { tariffId } of tariffs) {
      const versions = await this.deps.tariffs.listVersions(
        context,
        carrier.organisationId,
        tariffId,
      );
      const tariff = selectVersion(versions, shipment.date);
      if (tariff) results.push(calculatePrice(tariff, shipment));
    }
    return results;
  }
}

function cheapestOf(results: readonly PriceResult[]): PriceResult | null {
  const priced = results.filter((result) => result.status === "priced");
  if (priced.length === 0) return results[0] ?? null;
  return priced.reduce((best, next) =>
    next.status === "priced" &&
    best.status === "priced" &&
    next.totalMinor < best.totalMinor
      ? next
      : best,
  );
}
