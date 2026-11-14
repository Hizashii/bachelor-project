// Delivery reliability for a carrier on a route, supplied by the statistics work later.
// Until a provider exists the screen shows "not available" instead of any percentage.

export type DeliveryReliability = {
  carrierOrganisationId: string;
  // Share of comparable past shipments delivered on time, 0 to 100.
  onTimePercent: number;
  // Number of past shipments the percentage is based on.
  sampleSize: number;
};

export interface ReliabilityProvider {
  forCarriers(
    organisationIds: readonly string[],
  ): Promise<DeliveryReliability[]>;
}

export const noReliabilityData: ReliabilityProvider = {
  async forCarriers() {
    return [];
  },
};
