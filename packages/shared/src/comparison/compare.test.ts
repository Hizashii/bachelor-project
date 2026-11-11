// Tests the comparison engine with small fixtures whose results were worked out by hand.

import { describe, expect, it } from "vitest";
import type { CompareInput } from "./compare.ts";
import { compareBids } from "./compare.ts";
import {
  band,
  bid,
  fee,
  kg,
  shipment,
  tender,
  uid,
  valid,
  zone,
} from "./fixtures.ts";

const NOW = "2027-02-01T00:00:00Z";
type Parts = Partial<CompareInput> & Pick<CompareInput, "shipments" | "bids">;

function run(parts: Parts) {
  return compareBids({
    tender,
    generatedAtUtc: NOW,
    validate: valid,
    ...parts,
  });
}

function totals(result: ReturnType<typeof run>, carrier = 0) {
  return result.carriers[carrier].shipments.map((s) => s.totalMinor);
}

describe("zones and carriers", () => {
  const s1 = shipment(1, "2680", kg(1000));
  const s2 = shipment(2, "8000", kg(1000));
  const zealand = bid(1, {
    zones: [zone(1, "ZEA", "20", "29")],
    rates: [band(1, "per_shipment", 0, null, 50_000, { days: 3 })],
  });
  const jutland = bid(2, {
    zones: [zone(2, "JUT", "80", "89")],
    rates: [band(2, "per_shipment", 0, null, 42_000, { days: 2 })],
  });

  it("prices each carrier only in its own zones and flags the rest", () => {
    const r = run({ shipments: [s1, s2], bids: [zealand, jutland] });
    expect(totals(r, 0)).toEqual([50_000, null]);
    expect(totals(r, 1)).toEqual([null, 42_000]);
    expect(r.carriers[0].shipments[1].reason).toBe("no_zone_match");
    expect(r.carriers.map((c) => c.coverageBasisPoints)).toEqual([5000, 5000]);
    expect(r.carriers[0].byZone).toEqual([
      { zoneCode: "ZEA", shipments: 1, totalMinor: 50_000 },
    ]);
    expect(r.carriers.map((c) => c.maxTransitDays)).toEqual([3, 2]);
    expect(r.cheapestRankableBidVersionId).toBe(jutland.id);
    expect(r.unmatchedShipmentIds).toEqual([]);
  });

  it("lists shipments no tender zone covers and never prices them", () => {
    const far = shipment(3, "9990", kg(10));
    const tenderZones = [
      {
        id: uid(9),
        tenderId: uid(1),
        code: "Z",
        name: "Z",
        dataVersion: 1,
        ranges: [{ fromPrefix: "20", toPrefix: "89", priority: 1 }],
      },
    ];
    const r = run({ shipments: [s1, far], bids: [zealand], tenderZones });
    expect(r.unmatchedShipmentIds).toEqual([far.id]);
    expect(r.carriers[0].totalMinor).toBe(50_000);
    expect(r.carriers[0].rankable).toBe(true);
  });
});

describe("rate bands", () => {
  const z = [zone(1, "A", "20", "29")];
  const rates = [
    band(1, "per_shipment", 0, 100, 1000),
    band(1, "per_shipment", 101, 500, 2000),
    band(1, "per_shipment", 501, null, 3000),
  ];
  const sizes = [100, 101, 500, 100.5, 501, 9000];
  const shipments = sizes.map((q, i) => shipment(i + 1, "2680", kg(q)));

  it("uses inclusive edges, an open top band, and flags gaps", () => {
    const r = run({ shipments, bids: [bid(1, { zones: z, rates })] });
    expect(totals(r)).toEqual([1000, 2000, 2000, null, 3000, 3000]);
    expect(r.carriers[0].shipments[3].reason).toBe("no_rate_band");
    expect(r.carriers[0].rankable).toBe(false);
  });

  it("rounds per_100kg half up: 1235 per 100 kg for 150 kg is 1853", () => {
    const r = run({
      shipments: [shipment(1, "2680", kg(150)), shipment(2, "2680", kg(250))],
      bids: [
        bid(1, { zones: z, rates: [band(1, "per_100kg", 0, null, 1235)] }),
      ],
    });
    expect(totals(r)).toEqual([1853, 3088]);
  });

  it("flags a missing rate, an unsupported unit and a foreign currency", () => {
    const pallets = [{ unit: "pallets" as const, value: 2 }];
    const one = (q: ReturnType<typeof kg>, offer: ReturnType<typeof bid>) =>
      run({ shipments: [shipment(1, "2680", q)], bids: [offer] });

    const missing = one(kg(10), bid(1, { zones: z }));
    expect(missing.carriers[0].shipments[0].reason).toBe("missing_rate");
    const unit = one(pallets, bid(1, { zones: z, rates }));
    expect(unit.carriers[0].shipments[0].reason).toBe("unit_unsupported");
    const eur = band(1, "per_shipment", 0, null, 900, { currency: "EUR" });
    const money = one(kg(10), bid(1, { zones: z, rates: [eur] }));
    expect(money.carriers[0].shipments[0].reason).toBe("currency_mismatch");
    expect(money.carriers[0].totalMinor).toBe(0);
    expect(money.cheapestRankableBidVersionId).toBeNull();
  });
});

describe("minimum charge, fuel and fees", () => {
  it("adds fuel and fees on the base after the minimum charge", () => {
    // base 200 x 50 kg = 10000, lifted to 15000. fuel 1250 bp = 1875.
    // fees: 2500 once + 10 x 50 kg = 500 + 333 bp of 15000 = 499.5 -> 500. total 20375.
    const dkk = (amountMinor: number) => ({ amountMinor, currency: "DKK" });
    const surcharges = [
      fee("fuel", { kind: "percentage", basisPoints: 1250 }),
      fee("additional", { kind: "fixed", amount: dkk(2500) }),
      fee("additional", { kind: "fixed", amount: dkk(10) }, "quantity"),
      fee("additional", { kind: "percentage", basisPoints: 333 }, "rate_band"),
    ];
    const offer = bid(1, {
      zones: [zone(1, "A", "20", "29")],
      rates: [band(1, "per_kg", 0, null, 200)],
      minimumChargeMinor: 15_000,
      surcharges,
    });
    const r = run({ shipments: [shipment(1, "2680", kg(50))], bids: [offer] });
    const line = r.carriers[0].shipments[0];
    expect([
      line.baseMinor,
      line.fuelMinor,
      line.feesMinor,
      line.totalMinor,
    ]).toEqual([15_000, 1875, 3500, 20_375]);
  });
});

describe("ranking", () => {
  const z = [zone(1, "A", "20", "29")];
  const shipments = [shipment(1, "2680", kg(10))];
  const offer = (n: number, days: number, submittedAtUtc: string) =>
    bid(n, {
      zones: z,
      rates: [band(1, "per_shipment", 0, null, 1000, { days })],
      submittedAtUtc,
    });

  it("breaks ties by shorter transit, then earlier submission", () => {
    const slow = offer(1, 3, "2027-01-01T00:00:00Z");
    const fast = offer(2, 2, "2027-01-03T00:00:00Z");
    const early = offer(3, 2, "2027-01-02T00:00:00Z");
    const two = run({ shipments, bids: [slow, fast] });
    expect(two.cheapestRankableBidVersionId).toBe(fast.id);
    const three = run({ shipments, bids: [slow, fast, early] });
    expect(three.cheapestRankableBidVersionId).toBe(early.id);
  });

  it("scores only in weighted mode, with integer half-up rounding", () => {
    const weighted = {
      ...tender,
      evaluation: {
        mode: "weighted" as const,
        criteria: [
          { kind: "price" as const, weightBasisPoints: 6000 },
          { kind: "transit_time" as const, weightBasisPoints: 2000 },
          { kind: "coverage" as const, weightBasisPoints: 2000 },
        ],
      },
    };
    const price = (amount: number, days: number) =>
      band(1, "per_shipment", 0, null, amount, { days });
    const cheap = bid(1, { zones: z, rates: [price(10_000, 2)] });
    const dear = bid(2, { zones: z, rates: [price(20_000, 1)] });
    const r = run({ tender: weighted, shipments, bids: [cheap, dear] });
    // cheap: (10000x6000 + 6667x2000 + 10000x2000) / 10000 = 9333.4 -> 9333
    // dear: (5000x6000 + 10000x2000 + 10000x2000) / 10000 = 7000
    expect(r.carriers.map((c) => c.weightedScoreBasisPoints)).toEqual([
      9333, 7000,
    ]);
    const plain = run({ shipments, bids: [cheap, dear] });
    expect(plain.carriers.map((c) => c.weightedScoreBasisPoints)).toEqual([
      null,
      null,
    ]);
  });

  it("refuses to rank an offer the validator rejects", () => {
    const issue = { path: "", code: "x", message: "Rate missing" };
    const reject = () => ({ complete: false, issues: [issue] });
    const r = run({ shipments, bids: [offer(1, 1, NOW)], validate: reject });
    expect(r.carriers[0]).toMatchObject({
      rankable: false,
      invalidReasons: ["Rate missing"],
      pricedShipments: 0,
    });
    expect(r.carriers[0].shipments[0].reason).toBe("invalid_offer");
    expect(r.cheapestRankableBidVersionId).toBeNull();
  });
});
