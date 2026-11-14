// Prices one shipment with each carrier's tariff for the comparison screen.
// A carrier with no usable tariff is reported as such, never as a made-up price.
// Not for editing tariffs: see service.ts.

import {
  calculatePrice,
  type PriceResult,
  type PriceShipment,
  selectVersion,
} from "@freight-desk/shared";
import type { AccessContext, PermissionChecker } from "../contracts/access.ts";
import type { TariffService } from "./service.ts";

export type CarrierRef = { organisationId: string; tariffId: string };

export type CarrierPrice = {
  organisationId: string;
  tariffId: string;
  result:
    | PriceResult
    | { status: "no_tariff" }
    | { status: "denied" }
    | { status: "error" };
};

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

  private async priceOne(
    context: AccessContext,
    carrier: CarrierRef,
    shipment: PriceShipment,
  ): Promise<CarrierPrice["result"]> {
    const resource = { organisationId: carrier.organisationId };
    if (!this.deps.permissions.can(context, "price:calculate", resource)) {
      return { status: "denied" };
    }
    try {
      const versions = await this.deps.tariffs.listVersions(
        context,
        carrier.organisationId,
        carrier.tariffId,
      );
      const tariff = selectVersion(versions, shipment.date);
      return tariff
        ? calculatePrice(tariff, shipment)
        : { status: "no_tariff" };
    } catch {
      // One carrier's unreadable tariff must not stop the others from being priced.
      return { status: "error" };
    }
  }
}
