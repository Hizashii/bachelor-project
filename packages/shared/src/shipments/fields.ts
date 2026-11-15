// The normalised shipment fields every import is mapped onto.
// Not for parsing or cleaning values: see clean.ts and validate.ts.

import { z } from "zod";

export const shipmentFieldSchema = z.enum([
  "reference",
  "carrier",
  "originPostcode",
  "destinationPostcode",
  "collectionAt",
  "deliveryAt",
  "weightKg",
  "pallets",
  "loadingMeters",
  "cubicMeters",
  "packages",
  "quotedCostMinor",
  "invoiceReference",
  "trackingReference",
]);

export type ShipmentField = z.infer<typeof shipmentFieldSchema>;

export const SHIPMENT_FIELDS = shipmentFieldSchema.options;

// Fields a row cannot be priced or audited without.
export const REQUIRED_FIELDS: readonly ShipmentField[] = [
  "reference",
  "originPostcode",
  "destinationPostcode",
];

export const NUMBER_FIELDS: readonly ShipmentField[] = [
  "weightKg",
  "pallets",
  "loadingMeters",
  "cubicMeters",
  "packages",
];

export const DATE_FIELDS: readonly ShipmentField[] = [
  "collectionAt",
  "deliveryAt",
];

export const cleanShipmentSchema = z
  .object({
    sourceRow: z.number().int().positive(),
    reference: z.string().nullable(),
    carrier: z.string().nullable(),
    originPostcode: z.string().nullable(),
    destinationPostcode: z.string().nullable(),
    collectionAt: z.string().nullable(),
    deliveryAt: z.string().nullable(),
    weightKg: z.number().nullable(),
    pallets: z.number().nullable(),
    loadingMeters: z.number().nullable(),
    cubicMeters: z.number().nullable(),
    packages: z.number().nullable(),
    quotedCostMinor: z.number().int().nullable(),
    invoiceReference: z.string().nullable(),
    trackingReference: z.string().nullable(),
  })
  .strict();

export type CleanShipment = z.infer<typeof cleanShipmentSchema>;
