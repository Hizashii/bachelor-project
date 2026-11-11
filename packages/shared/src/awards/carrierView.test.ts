import { describe, expect, it } from "vitest";
import type { AwardRecord } from "../contracts/award.ts";
import { toCarrierView } from "./carrierView.ts";

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const WINNER = ID(1);
const LOSER = ID(2);

const award = {
  id: ID(3),
  tenderId: ID(4),
  carrierCompanyId: WINNER,
  bidVersionId: ID(5),
  decidedByUserId: ID(6),
  decision: "confirmed",
  evaluationScoreBasisPoints: null,
  selectionReason: "secret reason",
  awardedAtUtc: "2027-01-01T00:00:00Z",
  awardTemplate: {},
  evaluationSnapshot: { carriers: [{ totalMinor: 99 }] },
  recommendedBidVersionId: null,
  internalNotes: [{ text: "internal" }],
  negotiationNotes: [{ text: "negotiated" }],
} as unknown as AwardRecord;

const FORBIDDEN = [
  "internalNotes",
  "negotiationNotes",
  "evaluationSnapshot",
  "selectionReason",
  "bidVersionId",
  "carrierCompanyId",
  "totalMinor",
];

function allKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    key,
    ...allKeys(inner),
  ]);
}

describe("toCarrierView", () => {
  it("says won or not won and nothing else", () => {
    expect(toCarrierView(award.tenderId, award, WINNER).outcome).toBe("won");
    expect(toCarrierView(award.tenderId, award, LOSER).outcome).toBe("not_won");
  });

  it("is pending without a confirmed award", () => {
    const cancelled = { ...award, decision: "cancelled" as const };
    expect(toCarrierView(award.tenderId, null, WINNER).outcome).toBe("pending");
    expect(toCarrierView(award.tenderId, cancelled, WINNER).outcome).toBe(
      "pending",
    );
  });

  it("never carries internal data, at any depth", () => {
    for (const company of [WINNER, LOSER]) {
      const keys = allKeys(toCarrierView(award.tenderId, award, company));
      expect(keys.filter((key) => FORBIDDEN.includes(key))).toEqual([]);
    }
  });
});
