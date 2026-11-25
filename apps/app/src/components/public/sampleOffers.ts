// Example numbers for the public homepage. They are not real offers.

export type SampleOffer = {
  carrier: string;
  annualPriceDkk: number;
  coveragePercent: number;
  deliveryDays: number;
  best: boolean;
};

export const SAMPLE_OFFERS: SampleOffer[] = [
  {
    carrier: "Northline Transport",
    annualPriceDkk: 1_248_000,
    coveragePercent: 96,
    deliveryDays: 2,
    best: false,
  },
  {
    carrier: "Sydfragt Logistics",
    annualPriceDkk: 1_172_500,
    coveragePercent: 100,
    deliveryDays: 2,
    best: true,
  },
  {
    carrier: "Baltic Road Cargo",
    annualPriceDkk: 1_305_800,
    coveragePercent: 92,
    deliveryDays: 3,
    best: false,
  },
  {
    carrier: "Jysk Fragt",
    annualPriceDkk: 1_219_300,
    coveragePercent: 88,
    deliveryDays: 3,
    best: false,
  },
];

export function formatDkk(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(value)} DKK`;
}
