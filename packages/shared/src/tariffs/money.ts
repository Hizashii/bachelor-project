// Exact money arithmetic on whole minor units (øre) using BigInt. No floating point.
// Not for formatting or currency conversion.

const MILLI = 1000n;

export function toMilli(quantity: number): bigint {
  return BigInt(Math.round(quantity * Number(MILLI)));
}

export function fromMilli(milli: bigint): number {
  return Number(milli) / Number(MILLI);
}

// (a * b) / divisor, rounded half up. All inputs must be non-negative.
export function mulDivRound(a: bigint, b: bigint, divisor: bigint): bigint {
  return (a * b * 2n + divisor) / (divisor * 2n);
}

export function roundUpToStep(value: bigint, step: bigint): bigint {
  return ((value + step - 1n) / step) * step;
}

export function roundToStep(value: bigint, step: bigint): bigint {
  return mulDivRound(value, 1n, step) * step;
}

export function basisPointsOf(amount: bigint, basisPoints: number): bigint {
  return mulDivRound(amount, BigInt(basisPoints), 10_000n);
}

export function formatMoney(amountMinor: number, currency: string): string {
  const formatted = new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
  return `${formatted} ${currency}`;
}
