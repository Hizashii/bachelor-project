// This file proves the base rules every feature relies on: deny by default, hidden tenders, safe writes.

import type { Principal } from "@freight-desk/shared";
import { describe, expect, it } from "vitest";
import { issueSession, readSession } from "./auth/session.ts";
import { AppError } from "./errors.ts";
import { MemoryStore } from "./storage/memoryStore.ts";
import { loadVisibleTender } from "./tenders/access.ts";
import { saveInvitations } from "./tenders/repository.ts";
import { createTestKit } from "./testing/helpers.ts";

const COMPANY_A = "2f7d5f0e-1b0f-4c6f-8d2c-4a1b1f2d3e40";
const COMPANY_B = "3a8e6f1f-2c1f-4d7f-9e3d-5b2c2f3e4f51";
const carrierA: Principal = {
  userId: "ua",
  role: "carrier",
  carrierCompanyId: COMPANY_A,
};

describe("route guard", () => {
  it("refuses a route that declares no permission", async () => {
    const { app } = await createTestKit();
    expect(() => app.get("/open", async () => "x")).toThrow(/no permission/);
  });

  it("answers 401 without a session and 403 for the wrong role", async () => {
    const { app, cookieFor } = await createTestKit();
    app.get(
      "/api/x",
      { config: { action: "tender:manage" } },
      async () => "ok",
    );
    await app.ready();
    expect((await app.inject({ url: "/api/x" })).statusCode).toBe(401);
    const denied = await app.inject({
      url: "/api/x",
      cookies: cookieFor(carrierA),
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe("sessions", () => {
  it("rejects a tampered cookie and an idle one", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const cookie = issueSession(carrierA, "s".repeat(32), now);
    expect(readSession(`${cookie}x`, "s".repeat(32), now)).toBeNull();
    const later = new Date(now.getTime() + 31 * 60_000);
    expect(readSession(cookie, "s".repeat(32), later)).toBeNull();
  });
});

describe("tender visibility", () => {
  it("hides a tender from a carrier that was not invited", async () => {
    const { deps } = await createTestKit();
    const tenderId = "5c0a8e3b-4e3b-4f9b-8f5f-7d4e4b5f6a73";
    await deps.store.writeJson(
      `tenders/${tenderId}/tender.json`,
      openTender(tenderId),
      null,
    );
    await saveInvitations(
      deps.store,
      tenderId,
      [invite(tenderId, COMPANY_A)],
      null,
    );
    await expect(
      loadVisibleTender(deps, carrierA, tenderId),
    ).resolves.toBeTruthy();
    const rival: Principal = { ...carrierA, carrierCompanyId: COMPANY_B };
    await expect(
      loadVisibleTender(deps, rival, tenderId),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("file store", () => {
  it("never overwrites on create and rejects a stale etag", async () => {
    const store = new MemoryStore();
    const first = await store.writeJson("a.json", { n: 1 }, null);
    await expect(
      store.writeJson("a.json", { n: 2 }, null),
    ).rejects.toBeInstanceOf(AppError);
    await store.writeJson("a.json", { n: 2 }, first.etag);
    await expect(
      store.writeJson("a.json", { n: 3 }, first.etag),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

function invite(tenderId: string, companyId: string) {
  return {
    id: "6d1b9f4c-5f4c-4a0c-9a6a-8e5f5c6a7b84",
    tenderId,
    carrierCompanyId: companyId,
    invitedByUserId: "7e2c0a5d-6a5d-4b1d-8b7b-9f6a6d7b8c95",
    state: "invited" as const,
    invitedAtUtc: "2027-01-01T00:00:00Z",
    respondedAtUtc: null,
  };
}

function openTender(id: string) {
  const template = {
    id: "8f3d1b6e-7b6e-4c2e-9c8c-0a7b7e8c9da6",
    kind: "carrier_rate" as const,
    version: "1.0.0",
    fileName: "t.xlsx",
    checksumSha256: "a".repeat(64),
    status: "active" as const,
    approvedAtUtc: "2026-01-01T00:00:00Z",
  };
  return {
    id,
    name: "Northwind 2027",
    customerReference: "NW-1",
    status: "open",
    ownerUserId: "7e2c0a5d-6a5d-4b1d-8b7b-9f6a6d7b8c95",
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
    createdAtUtc: "2027-01-01T00:00:00Z",
    updatedAtUtc: "2027-01-01T00:00:00Z",
    openedAtUtc: "2027-01-01T00:00:00Z",
    closedAtUtc: null,
    awardedAtUtc: null,
    archivedAtUtc: null,
  };
}
