// The shipment basis of a tender: how many shipments go to each country in each weight band,
// and what share of them travel economy. It mirrors columns E and J of the express workbook.
// Staff only. Every save is a new numbered file, so an old revision is never overwritten.

import { z } from "zod";
import type { AccessContext } from "../auth/permissions.ts";
import type { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import type { TenderService } from "./service.ts";

const MAX_SHIPMENTS = 100_000_000;
const MAX_BASIS_POINTS = 10_000;
const BASIS_PREFIX = "basis-";
const BASIS_PATTERN = /^basis-[0-9a-f-]{36}-r(\d+)\.json$/i;

export const basisCountrySchema = z
  .object({
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    rows: z
      .array(
        z
          .object({
            label: z.string().min(1).max(60),
            numberOfShipments: z.number().int().min(0).max(MAX_SHIPMENTS),
            economyShareBasisPoints: z
              .number()
              .int()
              .min(0)
              .max(MAX_BASIS_POINTS),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export const shipmentBasisSchema = z
  .object({
    tenderId: z.string().uuid(),
    revision: z.number().int().min(1),
    updatedAtUtc: z.string(),
    countries: z.array(basisCountrySchema).max(60),
  })
  .strict();

export type BasisCountry = z.infer<typeof basisCountrySchema>;
export type ShipmentBasis = z.infer<typeof shipmentBasisSchema>;

export class BasisAccessError extends Error {}

type Dependencies = { documents: Documents; tenders: TenderService };

export class ShipmentBasisService {
  private readonly deps: Dependencies;

  constructor(deps: Dependencies) {
    this.deps = deps;
  }

  async get(
    context: AccessContext,
    tenderId: string,
  ): Promise<ShipmentBasis | null> {
    await this.assertStaff(context, tenderId);
    const files = await this.deps.documents.list(
      context,
      { kind: "tender", tenderId },
      `${BASIS_PREFIX}${tenderId}-r`,
    );
    const latest = files
      .map((file) => ({ file, revision: revisionOf(file.name) }))
      .filter((item) => item.revision > 0)
      .sort((a, b) => b.revision - a.revision)[0];
    if (!latest) return null;
    return shipmentBasisSchema.parse(
      await this.deps.documents.readJson(context, latest.file.id),
    );
  }

  async save(
    context: AccessContext,
    tenderId: string,
    countries: BasisCountry[],
    expectedRevision: number,
  ): Promise<ShipmentBasis> {
    const current = await this.get(context, tenderId);
    if ((current?.revision ?? 0) !== expectedRevision) {
      throw new StorageError("conflict", "Reload before saving again.");
    }
    const basis = shipmentBasisSchema.parse({
      tenderId,
      revision: expectedRevision + 1,
      updatedAtUtc: new Date().toISOString(),
      countries: countries.filter((country) =>
        country.rows.some((row) => row.numberOfShipments > 0),
      ),
    });
    await this.deps.documents.putJson(
      context,
      { kind: "tender", tenderId },
      `${BASIS_PREFIX}${tenderId}-r${basis.revision}.json`,
      basis,
    );
    return basis;
  }

  private async assertStaff(
    context: AccessContext,
    tenderId: string,
  ): Promise<void> {
    if (context.role === "carrier") {
      throw new BasisAccessError("Only staff can see the shipment basis.");
    }
    await this.deps.tenders.get(context, tenderId);
  }
}

function revisionOf(name: string): number {
  return Number(BASIS_PATTERN.exec(name)?.[1] ?? 0);
}
