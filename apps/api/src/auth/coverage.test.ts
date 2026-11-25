// This test calls every route without signing in. Only the sign-in routes may answer.

import { afterAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/testApp.ts";
import { testDatabaseUrl } from "../testing/testDatabase.ts";

const OPEN_ROUTES = new Set([
  "GET /health",
  "POST /auth/login",
  "POST /auth/accept-invitation",
  "POST /auth/reset-password",
  "POST /auth/logout",
]);

type Route = { method: string; url: string };

describe.skipIf(!testDatabaseUrl)("authentication coverage", () => {
  let close: () => Promise<void> = async () => undefined;
  afterAll(() => close());

  it("refuses every other route when nobody is signed in", async () => {
    const t = await createTestApp();
    close = () => t.database.end();
    const routes: Route[] = [];
    t.app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) {
        if (method !== "HEAD" && method !== "OPTIONS") {
          routes.push({ method, url: route.url });
        }
      }
    });
    await t.app.ready();

    const open: string[] = [];
    for (const route of routes) {
      const key = `${route.method} ${route.url}`;
      if (OPEN_ROUTES.has(key)) continue;
      const response = await t.app.inject({
        method: route.method as "GET",
        url: route.url.replace(/:[A-Za-z]+/g, "x"),
        headers: { origin: "http://localhost:4173" },
      });
      if (![401, 403].includes(response.statusCode))
        open.push(`${key} -> ${response.statusCode}`);
    }

    expect(routes.length).toBeGreaterThan(40);
    expect(open).toEqual([]);
  });
});
