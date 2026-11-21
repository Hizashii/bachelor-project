import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/testApp.ts";
import { testDatabaseUrl } from "../testing/testDatabase.ts";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const draft = {
  name: "API tender",
  customerReference: "API-001",
  displayTimeZone: "Europe/Copenhagen",
  currency: "DKK",
};

describe.skipIf(!testDatabaseUrl)("tender routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.addUser({ email: "staff-tender@example.test", role: "consultant" });
    await t.addUser({
      email: "carrier-tender@example.test",
      role: "carrier",
      carrierId: (
        await t.accounts.createCarrier("Tender Carrier", "Tender Carrier")
      ).id,
    });
  });

  afterAll(() => t.database.end());

  it("requires authentication and starts with no tender records", async () => {
    expect(
      (await t.app.inject({ method: "GET", url: "/api/tenders" })).statusCode,
    ).toBe(401);
    const headers = (await t.login("staff-tender@example.test")).headers;
    const response = await t.app.inject({
      method: "GET",
      url: "/api/tenders",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });

  it("creates, refreshes and updates a draft through the guarded API", async () => {
    const headers = (await t.login("staff-tender@example.test")).headers;
    const created = await t.app.inject({
      method: "POST",
      url: "/api/tenders",
      headers,
      payload: { draft },
    });
    expect(created.statusCode).toBe(200);
    const saved = created.json() as {
      tender: { id: string; name: string };
      etag: string;
    };
    const refreshed = await t.app.inject({
      method: "GET",
      url: `/api/tenders/${saved.tender.id}`,
      headers,
    });
    expect(refreshed.json().tender).toMatchObject({
      id: saved.tender.id,
      status: "draft",
    });

    const updated = await t.app.inject({
      method: "PUT",
      url: `/api/tenders/${saved.tender.id}/draft`,
      headers,
      payload: {
        draft: { ...draft, name: "Updated API tender" },
        ifMatch: saved.etag,
      },
    });
    expect(updated.statusCode).toBe(200);
    const stale = await t.app.inject({
      method: "PUT",
      url: `/api/tenders/${saved.tender.id}/draft`,
      headers,
      payload: { draft, ifMatch: saved.etag },
    });
    expect(stale.statusCode).toBe(409);
    expect(
      (
        await t.app.inject({
          method: "GET",
          url: `/api/tenders/${saved.tender.id}`,
          headers,
        })
      ).json().tender.name,
    ).toBe("Updated API tender");
  });

  it("does not grant carriers staff creation or uninvited listings", async () => {
    const headers = (await t.login("carrier-tender@example.test")).headers;
    expect(
      (
        await t.app.inject({ method: "GET", url: "/api/tenders", headers })
      ).json(),
    ).toMatchObject({ items: [], total: 0 });
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: "/api/tenders",
          headers,
          payload: { draft },
        })
      ).statusCode,
    ).toBe(403);
  });
});
