import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/testApp.ts";
import { testDatabaseUrl } from "../testing/testDatabase.ts";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe.skipIf(!testDatabaseUrl)("tender template routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.addUser({ email: "staff-tpl@example.test", role: "consultant" });
    await t.addUser({
      email: "carrier-tpl@example.test",
      role: "carrier",
      carrierId: (await t.accounts.createCarrier("Tpl Carrier", "Tpl Carrier"))
        .id,
    });
  });

  afterAll(() => t.database.end());

  it("lists the template registry for staff only", async () => {
    const url = "/api/documents/templates";
    expect((await t.app.inject({ method: "GET", url })).statusCode).toBe(401);
    const carrier = await t.login("carrier-tpl@example.test");
    const denied = await t.app.inject({
      method: "GET",
      url,
      headers: carrier.headers,
    });
    expect(denied.statusCode).toBe(403);
    const staff = await t.login("staff-tpl@example.test");
    const listed = await t.app.inject({
      method: "GET",
      url,
      headers: staff.headers,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.length).toBeGreaterThan(0);
  });

  it("reports an unconfigured tender without failing", async () => {
    const staff = await t.login("staff-tpl@example.test");
    const response = await t.app.inject({
      method: "GET",
      url: "/api/tenders/unbound-tender/templates",
      headers: staff.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: false, items: [] });
  });
});
