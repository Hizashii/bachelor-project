// Tests the offer-draft routes: who may touch a draft, the deadline, stale saves and a full round trip.

import type { Principal } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import { saveInvitations, saveTender } from "../tenders/repository.ts";
import { createTestKit } from "../testing/helpers.ts";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TENDER = uuid(1);
const ZONE = uuid(2);
const COMPANY_A = uuid(10);
const COMPANY_B = uuid(11);
const carrier = (company: string, n: number): Principal => ({
  userId: uuid(n),
  role: "carrier",
  carrierCompanyId: company,
});
const alice = carrier(COMPANY_A, 20);
const rival = carrier(COMPANY_B, 21);
const outsider = carrier(uuid(12), 22);
const URL = `/api/carrier/tenders/${TENDER}/offer-draft`;

const template = {
  id: uuid(3),
  kind: "carrier_rate" as const,
  version: "1.0.0",
  fileName: "t.xlsx",
  checksumSha256: "a".repeat(64),
  status: "active" as const,
  approvedAtUtc: "2026-01-01T00:00:00Z",
};

async function seed() {
  const kit = await createTestKit();
  await saveTender(
    kit.store,
    {
      id: TENDER,
      name: "Northwind 2027",
      customerReference: "NW-1",
      status: "open",
      ownerUserId: uuid(30),
      deadlineUtc: "2027-02-01T00:00:00Z",
      customerTimeZone: "Europe/Copenhagen",
      currency: "DKK",
      vatTreatment: "excluded",
      vatRateBasisPoints: 2500,
      zonePolicy: { overlapMode: "reject", unmatchedPostcodesBlockAward: true },
      evaluation: {
        mode: "cheapest_eligible",
        criteria: [{ kind: "price", weightBasisPoints: 10_000 }],
      },
      shipmentTemplate: { ...template, kind: "shipment" },
      carrierRateTemplate: template,
      createdAtUtc: "2027-01-01T00:00:00Z",
      updatedAtUtc: "2027-01-01T00:00:00Z",
      openedAtUtc: "2027-01-01T00:00:00Z",
      closedAtUtc: null,
      awardedAtUtc: null,
      archivedAtUtc: null,
    },
    null,
  );
  const invite = (company: string, n: number) => ({
    id: uuid(n),
    tenderId: TENDER,
    carrierCompanyId: company,
    invitedByUserId: uuid(30),
    state: "invited" as const,
    invitedAtUtc: "2027-01-01T00:00:00Z",
    respondedAtUtc: null,
  });
  await saveInvitations(
    kit.store,
    TENDER,
    [invite(COMPANY_A, 40), invite(COMPANY_B, 41)],
    null,
  );
  return kit;
}

function content(price: number) {
  return {
    zones: [
      {
        id: ZONE,
        code: "1",
        name: "Zone 1",
        originCountry: "DK",
        destinationCountry: "DK",
        originRanges: [],
        destinationRanges: [{ fromPrefix: "00", toPrefix: "49", priority: 0 }],
        destinationPostcodes: [],
      },
    ],
    rates: [
      {
        id: uuid(50),
        zoneId: ZONE,
        unit: "kg",
        basis: "per_shipment",
        fromQuantity: 0,
        toQuantity: null,
        price: { amountMinor: price, currency: "DKK" },
        deliveryTime: { minimumBusinessDays: 1, maximumBusinessDays: 2 },
        dataVersion: 1,
      },
    ],
    surcharges: [],
    serviceCoverage: { countryCodes: [], zoneIds: [], notes: "" },
    notes: {
      serviceDescription: "Daily",
      supportedUnits: ["kg"],
      minimumChargeMinor: null,
    },
  };
}

describe("offer draft routes", () => {
  it("creates, reloads and revises a draft", async () => {
    const kit = await seed();
    const cookies = kit.cookieFor(alice);
    const empty = (await kit.app.inject({ url: URL, cookies })).json();
    expect(empty.etag).toBeNull();
    expect(empty.draft.versionNumber).toBe(1);

    const created = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      payload: content(90_000),
    });
    expect(created.statusCode).toBe(200);
    const reloaded = (await kit.app.inject({ url: URL, cookies })).json();
    expect(reloaded.draft.rates[0].price.amountMinor).toBe(90_000);
    expect(reloaded.draft.state).toBe("draft");

    const revised = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      headers: { "if-match": reloaded.etag },
      payload: content(85_000),
    });
    expect(revised.statusCode).toBe(200);
    const checked = await kit.app.inject({
      method: "POST",
      url: `${URL}/validate`,
      cookies,
    });
    expect(checked.json()).toEqual({ complete: true, issues: [] });
    const preview = await kit.app.inject({ url: `${URL}/preview`, cookies });
    expect(preview.json().zones[0].lowestMinor).toBe(85_000);
  });

  it("rejects a stale save and a save without an etag over an existing draft", async () => {
    const kit = await seed();
    const cookies = kit.cookieFor(alice);
    await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      payload: content(1),
    });
    const first = (await kit.app.inject({ url: URL, cookies })).json().etag;
    await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      headers: { "if-match": first },
      payload: content(2),
    });
    const stale = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      headers: { "if-match": first },
      payload: content(3),
    });
    expect(stale.statusCode).toBe(412);
    const bare = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies,
      payload: content(3),
    });
    expect(bare.statusCode).toBe(412);
  });

  it("keeps drafts private and hides the tender from uninvited carriers", async () => {
    const kit = await seed();
    await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies: kit.cookieFor(alice),
      payload: content(90_000),
    });
    const rivalView = (
      await kit.app.inject({ url: URL, cookies: kit.cookieFor(rival) })
    ).json();
    expect(rivalView.etag).toBeNull();
    expect(rivalView.draft.rates).toEqual([]);
    const uninvited = await kit.app.inject({
      url: URL,
      cookies: kit.cookieFor(outsider),
    });
    expect(uninvited.statusCode).toBe(404);
    const write = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies: kit.cookieFor(outsider),
      payload: content(1),
    });
    expect(write.statusCode).toBe(404);
  });

  it("refuses edits after the deadline", async () => {
    const kit = await seed();
    kit.setNow("2027-02-01T00:00:01Z");
    const late = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies: kit.cookieFor(alice),
      payload: content(1),
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("DEADLINE_PASSED");
  });

  it("refuses a body the carrier is not allowed to set", async () => {
    const kit = await seed();
    const body = { ...content(1), carrierCompanyId: COMPANY_B };
    const res = await kit.app.inject({
      method: "PUT",
      url: URL,
      cookies: kit.cookieFor(alice),
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});
