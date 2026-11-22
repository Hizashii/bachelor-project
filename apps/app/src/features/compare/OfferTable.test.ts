// Test for picking the cheapest priced offer. Carriers that could not be priced never count.

import { describe, expect, it } from "vitest";
import { cheapestTotal, type OfferLine } from "./OfferTable.tsx";

const carrier = { organisationId: "a", name: "A" };
const line = (price: OfferLine["price"]): OfferLine => ({
  carrier,
  price,
  reliability: null,
});
const priced = (totalMinor: number): OfferLine["price"] => ({
  status: "priced",
  tariffId: "t",
  version: 1,
  currency: "DKK",
  zoneName: "Z",
  chargeableQuantity: 1,
  totalMinor,
  lines: [],
});

describe("cheapestTotal", () => {
  it("ignores offers without a price and returns null when none are priced", () => {
    expect(
      cheapestTotal([
        line(priced(500)),
        line({ status: "no_tariff" }),
        line(priced(300)),
      ]),
    ).toBe(300);
    expect(
      cheapestTotal([
        line({ status: "no_tariff" }),
        line({ status: "denied" }),
      ]),
    ).toBeNull();
  });
});
