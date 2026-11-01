export type CarrierOffer = {
  name: string;
  price: number;
  deliveryDays: number;
  onTimeRate: number;
  invoiceAccuracy: number;
};

export const shipment = {
  origin: "8300 Odder",
  destination: "2680 Solrød Strand",
  goods: "6 paller · 2,4 LDM · 2.400 kg",
};

export const carrierOffers: CarrierOffer[] = [
  {
    name: "Transportør A",
    price: 2180,
    deliveryDays: 1,
    onTimeRate: 94,
    invoiceAccuracy: 98,
  },
  {
    name: "Transportør B",
    price: 1940,
    deliveryDays: 2,
    onTimeRate: 81,
    invoiceAccuracy: 93,
  },
  {
    name: "Transportør C",
    price: 2350,
    deliveryDays: 1,
    onTimeRate: 97,
    invoiceAccuracy: 99,
  },
  {
    name: "Transportør D",
    price: 2060,
    deliveryDays: 2,
    onTimeRate: 88,
    invoiceAccuracy: 95,
  },
];

export function formatDkk(amount: number): string {
  return new Intl.NumberFormat("da-DK").format(amount);
}
