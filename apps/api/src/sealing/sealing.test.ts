// This file proves the deadline and sealed-bid rules through the real API and storage fakes.

import type { Principal, StoredBid, Tender } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors.ts";
import { saveInvitations, saveTender } from "../tenders/repository.ts";
import { createTestKit, type TestKit } from "../testing/helpers.ts";
import { readSubmittedBids } from "./access.ts";
import { closeOverdueTenders, closeTender } from "./closing.ts";
import { assertTenderAcceptsBids } from "./window.ts";

const TENDER = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a73";
const COMPANY = "2f7d5f0e-1b0f-4c6f-8d2c-4a1b1f2d3e40";
const USER = "7e2c0a5d-6a5d-4b1d-8b7b-9f6a6d7b8c95";
const ID = "8f3d1b6e-7b6e-4c2e-9c8c-0a7b7e8c9da6";
const SECRET_PRICE = 987654;
const DEADLINE = "2027-02-01T00:00:00Z";
const BIDS = `tenders/${TENDER}/bids/${COMPANY}`;

const consultant: Principal = {
  userId: "c1",
  role: "consultant",
  carrierCompanyId: null,
};
const master: Principal = { ...consultant, userId: "m1", role: "master" };
const carrier: Principal = {
  userId: "k1",
  role: "carrier",
  carrierCompanyId: COMPANY,
};

const template = {
  id: ID,
  kind: "carrier_rate" as const,
  version: "1.0.0",
  fileName: "t.xlsx",
  checksumSha256: "a".repeat(64),
  status: "active" as const,
  approvedAtUtc: "2026-01-01T00:00:00Z",
};

function tender(status: Tender["status"] = "open"): Tender {
  return {
    id: TENDER,
    name: "Northwind 2027",
    customerReference: "NW-1",
    status,
    ownerUserId: USER,
    deadlineUtc: DEADLINE,
    customerTimeZone: "Europe/Copenhagen",
    currency: "DKK",
    vatTreatment: "excluded",
    vatRateBasisPoints: 2500,
    zonePolicy: { overlapMode: "reject", unmatchedPostcodesBlockAward: true },
    evaluation: {
      mode: "cheapest_eligible",
      criteria: [{ kind: "price", weightBasisPoints: 10000 }],
    },
    shipmentTemplate: { ...template, kind: "shipment" },
    carrierRateTemplate: template,
    createdAtUtc: "2027-01-01T00:00:00Z",
    updatedAtUtc: "2027-01-01T00:00:00Z",
    openedAtUtc: "2027-01-01T00:00:00Z",
    closedAtUtc: null,
    awardedAtUtc: null,
    archivedAtUtc: null,
  };
}

function bid(): StoredBid {
  return {
    id: ID,
    tenderId: TENDER,
    carrierCompanyId: COMPANY,
    createdByUserId: USER,
    versionNumber: 1,
    state: "submitted",
    rates: [
      {
        id: ID,
        zoneId: ID,
        unit: "pallets",
        basis: "per_pallet",
        fromQuantity: 0,
        toQuantity: null,
        price: { amountMinor: SECRET_PRICE, currency: "DKK" },
        deliveryTime: { minimumBusinessDays: 1, maximumBusinessDays: 2 },
        dataVersion: 1,
      },
    ],
    surcharges: [],
    serviceCoverage: { countryCodes: ["DK"], zoneIds: [], notes: "" },
    createdAtUtc: "2027-01-10T00:00:00Z",
    submittedAtUtc: "2027-01-10T00:00:00Z",
    supersedesVersionId: null,
    withdrawnAtUtc: null,
    sourceTemplate: null,
    zones: [],
    notes: {
      serviceDescription: "",
      supportedUnits: ["pallets"],
      minimumChargeMinor: null,
    },
  };
}

async function seed(status: Tender["status"] = "open"): Promise<TestKit> {
  const kit = await createTestKit();
  await saveTender(kit.store, tender(status), null);
  await saveInvitations(
    kit.store,
    TENDER,
    [
      {
        id: ID,
        tenderId: TENDER,
        carrierCompanyId: COMPANY,
        invitedByUserId: USER,
        state: "invited",
        invitedAtUtc: "2027-01-01T00:00:00Z",
        respondedAtUtc: null,
      },
    ],
    null,
  );
  await kit.store.writeJson(`${BIDS}/v1.json`, bid(), null);
  await kit.store.writeJson(
    `${BIDS}/current.json`,
    {
      versionNumber: 1,
      bidVersionId: ID,
      submittedAtUtc: "2027-01-10T00:00:00Z",
    },
    null,
  );
  return kit;
}

async function auditText(kit: TestKit): Promise<string> {
  const files = await kit.store.list("audit");
  const texts = await Promise.all(
    files.map(async (name) => {
      const bytes = await kit.store.readBytes(`audit/${name}`);
      return new TextDecoder().decode(bytes?.data);
    }),
  );
  return texts.join("");
}

describe("deadline", () => {
  it("rejects at the exact deadline and closes the tender once", async () => {
    const kit = await seed();
    kit.setNow("2027-01-31T23:59:59Z");
    await expect(
      assertTenderAcceptsBids(kit.deps, TENDER),
    ).resolves.toBeTruthy();
    kit.setNow(DEADLINE);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        assertTenderAcceptsBids(kit.deps, TENDER),
      ).rejects.toMatchObject({
        code: attempt === 0 ? "DEADLINE_PASSED" : "TENDER_NOT_OPEN",
      });
    }
    const closes = (await auditText(kit)).split("tender.close").length - 1;
    expect(closes).toBe(1);
  });

  it("closes overdue tenders in a job run and is safe to run twice", async () => {
    const kit = await seed();
    kit.setNow("2027-03-01T00:00:00Z");
    expect(await closeOverdueTenders(kit.deps)).toEqual([TENDER]);
    expect(await closeOverdueTenders(kit.deps)).toEqual([]);
  });

  it("does not close a draft tender", async () => {
    const kit = await seed("draft");
    const attempt = closeTender(kit.deps, TENDER, {
      userId: "c1",
      role: "consultant",
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
  });
});

describe("sealed bids", () => {
  it("refuses a consultant while open, with no price in the answer", async () => {
    const kit = await seed();
    kit.setNow("2027-01-20T00:00:00Z");
    const res = await kit.app.inject({
      url: `/api/tenders/${TENDER}/bids`,
      cookies: kit.cookieFor(consultant),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("BID_SEALED");
    expect(res.body).not.toContain(String(SECRET_PRICE));
  });

  it("shows counts only before opening", async () => {
    const kit = await seed();
    kit.setNow("2027-01-20T00:00:00Z");
    const res = await kit.app.inject({
      url: `/api/tenders/${TENDER}/bids/status`,
      cookies: kit.cookieFor(consultant),
    });
    expect(res.json()).toEqual({ invited: 1, submitted: 1, opened: false });
  });

  it("opens by itself once the deadline has passed", async () => {
    const kit = await seed();
    kit.setNow("2027-02-02T00:00:00Z");
    const bids = await readSubmittedBids(kit.deps, consultant, TENDER);
    expect(bids).toHaveLength(1);
    expect(bids[0]?.rates[0]?.price.amountMinor).toBe(SECRET_PRICE);
  });

  it("never serves a carrier, even when closed", async () => {
    const kit = await seed("closed");
    await expect(
      readSubmittedBids(kit.deps, carrier, TENDER),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("skips a withdrawn bid", async () => {
    const kit = await seed("closed");
    const file = await kit.store.readJson(`${BIDS}/v1.json`);
    const withdrawn = { ...bid(), withdrawnAtUtc: "2027-01-12T00:00:00Z" };
    await kit.store.writeJson(`${BIDS}/v1.json`, withdrawn, file?.etag ?? "");
    expect(await readSubmittedBids(kit.deps, master, TENDER)).toEqual([]);
  });
});

describe("unseal", () => {
  const unseal = (kit: TestKit, who: Principal, reason: string) =>
    kit.app.inject({
      method: "POST",
      url: `/api/tenders/${TENDER}/unseal`,
      cookies: kit.cookieFor(who),
      payload: { reason },
    });

  it("needs the master and a real reason", async () => {
    const kit = await seed();
    kit.setNow("2027-01-20T00:00:00Z");
    expect((await unseal(kit, consultant, "customer asked")).statusCode).toBe(
      403,
    );
    expect((await unseal(kit, master, "short")).statusCode).toBe(400);
  });

  it("opens bids, keeps the reason out of the audit log", async () => {
    const kit = await seed();
    kit.setNow("2027-01-20T00:00:00Z");
    const reason = "customer needs early view";
    expect((await unseal(kit, master, reason)).statusCode).toBe(200);
    const res = await kit.app.inject({
      url: `/api/tenders/${TENDER}/bids`,
      cookies: kit.cookieFor(consultant),
    });
    expect(res.statusCode).toBe(200);
    const log = await auditText(kit);
    expect(log).toContain("bid.unseal");
    expect(log).not.toContain(reason);
    const marker = await kit.store.readJson(`tenders/${TENDER}/unsealed.json`);
    expect(JSON.stringify(marker?.data)).toContain(reason);
  });
});

describe("manual close", () => {
  it("needs confirmation and then opens the bids", async () => {
    const kit = await seed();
    kit.setNow("2027-01-20T00:00:00Z");
    const close = (payload: unknown) =>
      kit.app.inject({
        method: "POST",
        url: `/api/tenders/${TENDER}/close`,
        cookies: kit.cookieFor(consultant),
        payload: payload as object,
      });
    expect((await close({})).statusCode).toBe(400);
    expect((await close({ confirm: true })).statusCode).toBe(200);
    expect((await close({ confirm: true })).statusCode).toBe(200);
    const res = await kit.app.inject({
      url: `/api/tenders/${TENDER}/bids`,
      cookies: kit.cookieFor(consultant),
    });
    expect(res.statusCode).toBe(200);
  });
});
