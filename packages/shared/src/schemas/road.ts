import { z } from "zod";

export const pricingUnitSchema = z.enum(["KG", "CBM", "LDM", "PLL"]);

export const zoneRangeSchema = z.object({
  from: z.string().regex(/^\d{1,2}$/),
  to: z.union([z.string().regex(/^\d{1,2}$/), z.literal("")]),
  name: z.string().min(1),
});

export const priceBandSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().positive().nullable(),
  values: z.array(z.string()),
});

export const roadPriceListSchema = z.object({
  id: z.string().uuid(),
  carrierName: z.string().min(1),
  unit: pricingUnitSchema,
  zones: z.array(zoneRangeSchema),
  priceBands: z.array(priceBandSchema),
  submittedAt: z.string().datetime(),
});

export type PricingUnit = z.infer<typeof pricingUnitSchema>;
export type ZoneRange = z.infer<typeof zoneRangeSchema>;
export type PriceBand = z.infer<typeof priceBandSchema>;
export type RoadPriceList = z.infer<typeof roadPriceListSchema>;
