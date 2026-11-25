// These tests prove the shipment basis is staff-only, versioned, and read from the workbook.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { permissions } from "../auth/permissions.ts";
import { Documents } from "../storage/documents.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
import { BasisAccessError, ShipmentBasisService } from "./basis.ts";
import { parseBasisWorkbook } from "./basisWorkbook.ts";
import { TenderService } from "./service.ts";

const staff: AccessContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  organisationId: "slinkert-aaroe",
  role: "consultant",
};
const carrier: AccessContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  organisationId: "33333333-3333-4333-8333-333333333333",
  role: "carrier",
};

async function setup() {
  const documents = new Documents(createMemoryStorage());
  const tenders = new TenderService({ documents, permissions });
  const created = await tenders.create(staff, {
    name: "Basis",
    customerReference: "B-1",
    displayTimeZone: "Europe/Copenhagen",
    currency: "DKK",
  });
  return {
    basis: new ShipmentBasisService({ documents, tenders }),
    tenderId: created.tender.id,
  };
}

describe("shipment basis", () => {
  it("saves new revisions, keeps only countries with shipments, and refuses a stale save", async () => {
    const { basis, tenderId } = await setup();
    expect(await basis.get(staff, tenderId)).toBeNull();

    const rows = [
      {
        label: "0-1 kg",
        numberOfShipments: 40,
        economyShareBasisPoints: 5_000,
      },
    ];
    const first = await basis.save(
      staff,
      tenderId,
      [
        { countryCode: "DE", rows },
        {
          countryCode: "SE",
          rows: [
            {
              label: "0-1 kg",
              numberOfShipments: 0,
              economyShareBasisPoints: 0,
            },
          ],
        },
      ],
      0,
    );
    expect(first.revision).toBe(1);
    expect(first.countries.map((c) => c.countryCode)).toEqual(["DE"]);

    await expect(basis.save(staff, tenderId, [], 0)).rejects.toThrow(/Reload/);
    const second = await basis.save(staff, tenderId, first.countries, 1);
    expect((await basis.get(staff, tenderId))?.revision).toBe(second.revision);
  });

  it("is not visible to carriers", async () => {
    const { basis, tenderId } = await setup();
    await expect(basis.get(carrier, tenderId)).rejects.toBeInstanceOf(
      BasisAccessError,
    );
  });
});

describe("shipment basis workbook", () => {
  async function workbook(share: unknown) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("DK-DE");
    sheet.getCell("B14").value = "0-1 kg";
    sheet.getCell("E14").value = 120;
    sheet.getCell("J14").value = share as number;
    book.addWorksheet("DK-SE");
    return (await book.xlsx.writeBuffer()) as never;
  }

  it("reads shipments from column E and the economy share from column J", async () => {
    const fraction = await parseBasisWorkbook(await workbook(0.4));
    expect(fraction).toEqual([
      {
        countryCode: "DE",
        rows: [
          {
            label: "0-1 kg",
            numberOfShipments: 120,
            economyShareBasisPoints: 4_000,
          },
        ],
      },
    ]);
    const percent = await parseBasisWorkbook(await workbook(40));
    expect(percent[0]?.rows[0]?.economyShareBasisPoints).toBe(4_000);
  });

  it("refuses a row with shipments but no economy share", async () => {
    await expect(parseBasisWorkbook(await workbook(null))).rejects.toThrow(
      /DK-DE row 14/,
    );
  });
});
