// Ranks carrier results: picks the cheapest rankable offer and, only in weighted mode,
// scores each rankable offer. Pure functions on finished results.
// Tie-break (docs/BUSINESS_RULES.md): lower total, shorter max transit (unknown last),
// earlier submission, then bid id so the answer is always the same.
// Only carriers with the widest coverage among rankable ones compete, so a carrier cannot
// win by leaving shipments unpriced.
// Weighted scores (basis points, 0..10000): price = lowest total / own total, transit =
// (fastest + 1) / (own + 1), coverage = coverage basis points, service_quality = 0 because
// no quality data exists in an offer yet. Final score = sum(score x weight) / 10000, half up.

import type { CarrierResult } from "../contracts/comparison.ts";
import type { Evaluation } from "../types/business.ts";
import { divideHalfUp } from "./money.ts";

const FULL = 10_000n;
const UNKNOWN_TRANSIT = Number.MAX_SAFE_INTEGER;

export type Ranked = { result: CarrierResult; submittedAtUtc: string };

function transitOf(result: CarrierResult): number {
  return result.maxTransitDays ?? UNKNOWN_TRANSIT;
}

function compareRanked(a: Ranked, b: Ranked): number {
  return (
    a.result.totalMinor - b.result.totalMinor ||
    transitOf(a.result) - transitOf(b.result) ||
    Date.parse(a.submittedAtUtc) - Date.parse(b.submittedAtUtc) ||
    a.result.bidVersionId.localeCompare(b.result.bidVersionId)
  );
}

export function cheapestBidVersionId(ranked: readonly Ranked[]): string | null {
  const rankable = ranked.filter((r) => r.result.rankable);
  const widest = Math.max(0, ...rankable.map((r) => r.result.pricedShipments));
  const field = rankable.filter((r) => r.result.pricedShipments === widest);
  return field.sort(compareRanked)[0]?.result.bidVersionId ?? null;
}

function ratio(best: number, own: number): bigint {
  return own <= 0 ? FULL : divideHalfUp(BigInt(best) * FULL, BigInt(own));
}

function criterionScore(
  kind: Evaluation["criteria"][number]["kind"],
  result: CarrierResult,
  rankable: readonly CarrierResult[],
): bigint {
  if (kind === "coverage") return BigInt(result.coverageBasisPoints);
  if (kind === "service_quality") return 0n;
  if (kind === "price") {
    const best = Math.min(...rankable.map((r) => r.totalMinor));
    return ratio(best, result.totalMinor);
  }
  const best = Math.min(...rankable.map((r) => transitOf(r)));
  return ratio(best + 1, transitOf(result) + 1);
}

// Returns the carriers with weightedScoreBasisPoints set (rankable only) in weighted mode.
export function withWeightedScores(
  results: readonly CarrierResult[],
  evaluation: Evaluation,
): CarrierResult[] {
  if (evaluation.mode !== "weighted") return [...results];
  const rankable = results.filter((r) => r.rankable);
  return results.map((result) => {
    if (!result.rankable) return result;
    let sum = 0n;
    for (const c of evaluation.criteria) {
      const score = criterionScore(c.kind, result, rankable);
      sum += score * BigInt(c.weightBasisPoints);
    }
    return {
      ...result,
      weightedScoreBasisPoints: Number(divideHalfUp(sum, FULL)),
    };
  });
}
