// This file proves carriers see only their invited tenders and nothing of rivals.

import type { Principal } from "@freight-desk/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { saveInvitations, saveTender } from "../tenders/repository.ts";
import { createTestKit, type TestKit } from "../testing/helpers.ts";

const COMPANY_A = "2f7d5f0e-1b0f-4c6f-8d2c-4a1b1f2d3e40";
const COMPANY_B = "3a8e6f1f-2c1f-4d7f-9e3d-5b2c2f3e4f51";
const T_A = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a73";
const T_B = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a74";
const T_DRAFT = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a75";
const T_CLOSED = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a76";
const USER = "7e2c0a5d-6a5d-4b1d-8b7b-9f6a6d7b8c95";
const NOW = "2027-01-01T00:00:00Z";

const carrier = (companyId: string): Principal => ({
  userId: "u",
  role: "carrier",
  carrierCompanyId: companyId,
});
const consultant: Principal = {
  userId: "c",
  role: "consultant",
  carrierCompanyId: null,
};

function tender(id: string, status: string) {
  const template = {
    id: "8f3d1b6e-7b6e-4c2e-9c8c-0a7b7e8c9da6",
    kind: "carrier_rate" as const,
    version: "1.0.0",
    fileName: "t.xlsx",
    checksumSha256: "a".repeat(64),
    status: "active" as const,
    approvedAtUtc: NOW,
  };
  return {
    id,
    name: `Tender ${status}`,
    customerReference: "NW-1",
    status,
    ownerUserId: USER,
    deadlineUtc: "2027-02-01T00:00:00Z",
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
    createdAtUtc: NOW,
    updatedAtUtc: NOW,
    openedAtUtc: null,
    closedAtUtc: null,
    awardedAtUtc: null,
    archivedAtUtc: null,
  };
}

async function seed(kit: TestKit, id: string, status: string, company: string) {
  await saveTender(kit.store, tender(id, status) as never, null);
  await saveInvitations(
    kit.store,
    id,
    [
      {
        id: "6d1b9f4c-5f4c-4a0c-9a6a-8e5f5c6a7b84",
        tenderId: id,
        carrierCompanyId: company,
        invitedByUserId: USER,
        state: "invited",
        invitedAtUtc: NOW,
        respondedAtUtc: null,
      },
    ],
    null,
  );
}

let kit: TestKit;
beforeEach(async () => {
  kit = await createTestKit();
  await seed(kit, T_A, "open", COMPANY_A);
  await seed(kit, T_B, "open", COMPANY_B);
  await seed(kit, T_DRAFT, "draft", COMPANY_A);
  await seed(kit, T_CLOSED, "closed", COMPANY_A);
});

const get = (url: string, who: Principal) =>
  kit.app.inject({ url, cookies: kit.cookieFor(who) });

describe("carrier tender routes", () => {
  it("lists only invited, non-draft tenders and filters by status", async () => {
    const all = (await get("/api/carrier/tenders", carrier(COMPANY_A))).json();
    expect(all.tenders.map((t: { id: string }) => t.id).sort()).toEqual(
      [T_A, T_CLOSED].sort(),
    );
    const closed = await get(
      "/api/carrier/tenders?status=closed",
      carrier(COMPANY_A),
    );
    expect(closed.json().tenders.map((t: { id: string }) => t.id)).toEqual([
      T_CLOSED,
    ]);
  });

  it("gives not found for a rival's tender and ignores a companyId query", async () => {
    const rival = await get(`/api/carrier/tenders/${T_B}`, carrier(COMPANY_A));
    expect(rival.statusCode).toBe(404);
    const spoof = await get(
      `/api/carrier/tenders?companyId=${COMPANY_B}`,
      carrier(COMPANY_A),
    );
    expect(spoof.json().tenders.map((t: { id: string }) => t.id)).not.toContain(
      T_B,
    );
  });

  it("hides a draft tender and refuses consultants", async () => {
    const draft = await get(
      `/api/carrier/tenders/${T_DRAFT}`,
      carrier(COMPANY_A),
    );
    expect(draft.statusCode).toBe(404);
    expect((await get("/api/carrier/tenders", consultant)).statusCode).toBe(
      403,
    );
  });

  it("shows own submission status and no internal fields", async () => {
    await kit.store.writeJson(
      `tenders/${T_A}/bids/${COMPANY_A}/draft.json`,
      { any: "thing" },
      null,
    );
    const body = (
      await get(`/api/carrier/tenders/${T_A}`, carrier(COMPANY_A))
    ).json();
    expect(body.submission).toEqual({ state: "draft" });
    expect(body).not.toHaveProperty("ownerUserId");
    const other = (
      await get(`/api/carrier/tenders/${T_B}`, carrier(COMPANY_B))
    ).json();
    expect(other.submission).toEqual({ state: "none" });
  });
});
