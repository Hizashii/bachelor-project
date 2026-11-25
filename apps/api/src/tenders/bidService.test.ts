// These tests prove carrier bids are versioned and remain sealed while open.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { permissions } from "../auth/permissions.ts";
import { Documents } from "../storage/documents.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
import { BidService, BidStateError } from "./bidService.ts";
import type { PriceTemplateWorkbookInput } from "./priceTemplateExcel.ts";
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

async function priceWorkbook(): Promise<PriceTemplateWorkbookInput> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Total cost").getCell("C7").value = "Carrier A";
  const sheet = workbook.addWorksheet("DK-DE");
  for (let row = 14; row <= 31; row += 1) {
    sheet.getCell(row, 2).value =
      row === 31 ? "Over 300 kg" : `${row - 13}-${row - 12} kg`;
    sheet.getCell(row, 3).value = 100;
    sheet.getCell(row, 4).value = 120;
  }
  return (await workbook.xlsx.writeBuffer()) as unknown as PriceTemplateWorkbookInput;
}

async function setup() {
  const storage = createMemoryStorage();
  const documents = new Documents(storage);
  const tenders = new TenderService({ documents, permissions });
  const bids = new BidService({ documents, permissions, tenders });
  const created = await tenders.create(staff, {
    name: "Express lanes",
    customerReference: "EXP-001",
    displayTimeZone: "Europe/Copenhagen",
    currency: "DKK",
  });
  await documents.putJson(
    staff,
    { kind: "tenders" },
    `tender-${created.tender.id}-r2.json`,
    {
      ...created.tender,
      revision: 2,
      invitedCarrierCompanyIds: [carrier.organisationId],
    },
  );
  return { tenders, bids, tenderId: created.tender.id };
}

describe("carrier bid workflow", () => {
  it("stores a new version and keeps it sealed until close", async () => {
    const { tenders, bids, tenderId } = await setup();
    const opened = await tenders.open(staff, tenderId, "2");
    const first = await bids.submit(carrier, tenderId, await priceWorkbook());
    const second = await bids.submit(carrier, tenderId, await priceWorkbook());

    expect(first.versionNumber).toBe(1);
    expect(second).toMatchObject({
      versionNumber: 2,
      supersedesVersionId: first.id,
    });
    await expect(bids.listSubmitted(staff, tenderId)).rejects.toBeInstanceOf(
      BidStateError,
    );

    await tenders.close(staff, tenderId, opened.etag);
    const visible = await bids.listSubmitted(staff, tenderId);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.versionNumber).toBe(2);
  });
});
