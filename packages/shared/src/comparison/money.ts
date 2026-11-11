// Integer-only money maths for the comparison engine. No floats ever touch a price.
// Quantities are held in thousandths (3 decimals). Every division rounds half up
// (0.5 minor units goes up), and each rate line is rounded once, at the end.

const MILLI = 1000n;

// Converts a quantity such as 2.4 to thousandths (2400n). Extra decimals are rounded.
export function toMilli(value: number): bigint {
  return BigInt(Math.round(value * Number(MILLI)));
}

// Rounds numerator / denominator half up. Both must be non-negative and the denominator above 0.
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

export function percentOf(amount: number, basisPoints: number): number {
  return Number(divideHalfUp(BigInt(amount) * BigInt(basisPoints), 10_000n));
}

// price (minor units) x quantity, divided by `per` units (1 for most bases, 100 for per_100kg).
export function scaledPrice(
  priceMinor: number,
  quantityMilli: bigint,
  per: number,
): number {
  const numerator = BigInt(priceMinor) * quantityMilli;
  return Number(divideHalfUp(numerator, MILLI * BigInt(per)));
}

// Whole ratio in basis points, rounded half up. A zero denominator gives 0.
export function ratioBasisPoints(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Number(divideHalfUp(BigInt(part) * 10_000n, BigInt(whole)));
}
