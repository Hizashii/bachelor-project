import { describe, expect, it } from "vitest";
import type { Tender } from "../types/business.ts";
import { missingItems, publicationChecklist } from "./checklist.ts";

const template = (kind: "shipment" | "carrier_rate") => ({
  id: "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a73",
  kind,
  version: "1.0.0",
  fileName: "t.xlsx",
  checksumSha256: "a".repeat(64),
  status: "active" as const,
  approvedAtUtc: "2026-01-01T00:00:00Z",
});

const tender = {
  name: "Tender",
  customerReference: "REF-1",
  deadlineUtc: "2027-02-01T10:00:00Z",
  currency: "DKK",
  shipmentTemplate: template("shipment"),
  carrierRateTemplate: template("carrier_rate"),
} as Tender;

const now = new Date("2027-01-01T00:00:00Z");

describe("publicationChecklist", () => {
  it("passes a complete tender", () => {
    const items = publicationChecklist({ tender, now, reachableCarriers: 2 });
    expect(missingItems(items)).toEqual([]);
  });

  it("lists every missing item", () => {
    const bad = {
      ...tender,
      name: " ",
      deadlineUtc: "2026-12-31T00:00:00Z",
      carrierRateTemplate: { ...template("carrier_rate"), status: "retired" },
    } as Tender;
    const items = publicationChecklist({
      tender: bad,
      now,
      reachableCarriers: 0,
    });
    expect(missingItems(items)).toEqual([
      "name",
      "deadline",
      "templates",
      "carriers",
    ]);
  });
});
