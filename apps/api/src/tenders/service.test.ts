import type { Tender } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../auth/permissions.ts";
import { permissions } from "../auth/permissions.ts";
import { Documents } from "../storage/documents.ts";
import { StorageError } from "../storage/errors.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
import { TenderAccessError, TenderService } from "./service.ts";

const staff: AccessContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  organisationId: "slinkert-aaroe",
  role: "consultant",
};
const carrierA: AccessContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  organisationId: "33333333-3333-4333-8333-333333333333",
  role: "carrier",
};
const carrierB: AccessContext = {
  ...carrierA,
  userId: "44444444-4444-4444-8444-444444444444",
  organisationId: "55555555-5555-4555-8555-555555555555",
};

const input = {
  name: "Northern lanes",
  customerReference: "CUST-001",
  displayTimeZone: "Europe/Copenhagen",
  currency: "DKK",
};

function setup() {
  const storage = createMemoryStorage();
  const documents = new Documents(storage);
  return {
    documents,
    tenders: new TenderService({ documents, permissions }),
  };
}

describe("tender workflow", () => {
  it("starts empty and persists a draft across reads", async () => {
    const { tenders } = setup();
    expect((await tenders.list(staff, { limit: 20 })).total).toBe(0);
    const saved = await tenders.create(staff, input);
    const refreshed = await tenders.get(staff, saved.tender.id);

    expect(refreshed).toMatchObject({
      etag: "1",
      tender: {
        status: "draft",
        name: input.name,
        deadlineUtc: null,
        vatRateBasisPoints: null,
        shipmentTemplate: null,
        shipmentBasis: null,
      },
    });
  });

  it("rejects a stale draft save without overwriting the newer revision", async () => {
    const { tenders } = setup();
    const first = await tenders.create(staff, input);
    const newer = await tenders.updateDraft(
      staff,
      first.tender.id,
      { ...input, name: "Updated lanes" },
      first.etag,
    );

    await expect(
      tenders.updateDraft(
        staff,
        first.tender.id,
        { ...input, name: "Stale overwrite" },
        first.etag,
      ),
    ).rejects.toBeInstanceOf(StorageError);
    expect((await tenders.get(staff, first.tender.id)).tender.name).toBe(
      newer.tender.name,
    );
  });

  it("filters and paginates the saved records on the service boundary", async () => {
    const { tenders } = setup();
    await tenders.create(staff, input);
    await tenders.create(staff, {
      ...input,
      name: "Southern lanes",
      customerReference: "CUST-002",
    });

    const filtered = await tenders.list(staff, {
      query: "CUST-002",
      limit: 20,
    });
    const firstPage = await tenders.list(staff, { limit: 1 });

    expect(filtered).toMatchObject({ total: 1, nextCursor: null });
    expect(firstPage).toMatchObject({ total: 2, nextCursor: 1 });
  });

  it("only lists explicitly invited tenders to the matching carrier", async () => {
    const { documents, tenders } = setup();
    const invited: Tender = {
      ...(await tenders.create(staff, input)).tender,
      invitedCarrierCompanyIds: [carrierA.organisationId],
    };
    await documents.putJson(
      staff,
      { kind: "tenders" },
      `tender-${invited.id}-r2.json`,
      { ...invited, revision: 2 },
    );

    expect((await tenders.list(carrierA, { limit: 20 })).items).toHaveLength(1);
    expect((await tenders.list(carrierB, { limit: 20 })).items).toHaveLength(0);
    await expect(tenders.get(carrierB, invited.id)).rejects.toBeInstanceOf(
      TenderAccessError,
    );
  });
});
