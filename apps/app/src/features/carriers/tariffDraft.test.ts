// Tests for turning what a carrier typed into a shared tariff. Rates are synthetic.

import { importRateMatrix, validateTariff } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import {
  applyImport,
  emptyState,
  toTariff,
  zonesFromRows,
} from "./tariffDraft.ts";

const meta = {
  tariffId: "t-1",
  version: 1,
  carrierOrganisationId: "carrier-a",
  userId: "u1",
};
const NOW = "2026-03-01T10:00:00Z";

describe("tariff draft", () => {
  it("joins rows with the same zone name into one zone with several ranges", () => {
    const zones = zonesFromRows([
      { id: "a", name: "Zone 1", from: "00", to: "26" },
      { id: "b", name: "Zone 1", from: "40", to: "" },
    ]);
    expect(zones).toEqual([
      {
        id: "a",
        name: "Zone 1",
        ranges: [
          { from: "00", to: "26" },
          { from: "40", to: "40" },
        ],
      },
    ]);
  });

  it("builds a complete valid tariff from an imported grid", () => {
    const grid = importRateMatrix([
      ["Pris pr. 100 kg", "Zone A (00-99)"],
      ["0-100", "200,50"],
      ["100+", "150"],
    ]);
    const tariff = toTariff(
      applyImport(emptyState("2026-03-01"), grid, "rates.xlsx"),
      meta,
      NOW,
    );
    expect(tariff.rates.map((r) => r.amountMinor)).toEqual([20_050, 15_000]);
    expect(validateTariff(tariff).complete).toBe(true);
  });

  it("keeps a blank imported rate blank so the tariff stays incomplete", () => {
    const grid = importRateMatrix([
      ["Pris pr. 100 kg", "Zone A (00-99)"],
      ["0-100", ""],
      ["100+", "150"],
    ]);
    const tariff = toTariff(
      applyImport(emptyState("2026-03-01"), grid, "rates.xlsx"),
      meta,
      NOW,
    );
    expect(validateTariff(tariff).errors.map((e) => e.code)).toContain(
      "missing_rate",
    );
  });

  it("reads fuel surcharge and minimum charge", () => {
    const state = {
      ...emptyState("2026-03-01"),
      fuelPercent: "12,5",
      minimumCharge: "250",
    };
    const tariff = toTariff(state, meta, NOW);
    expect(tariff.surcharges[0]?.calculation).toEqual({
      kind: "percentage",
      basisPoints: 1250,
    });
    expect(tariff.minimumChargeMinor).toBe(25_000);
  });
});
