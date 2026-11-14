// HTTP-level tests: sign-in required, upload to download, organisation isolation, tariffs.

import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { AccessContext } from "../contracts/access.ts";
import { ImportService } from "../imports/importService.ts";
import { PricingService } from "../tariffs/pricing.ts";
import { TariffService } from "../tariffs/service.ts";
import { createMemoryStore, rolePermissions } from "../testing/memoryStore.ts";
import { registerFreightRoutes } from "./routes.ts";

const users: Record<string, AccessContext> = {
  staff: { userId: "s1", organisationId: "sa", role: "consultant" },
  rival: { userId: "r1", organisationId: "rival", role: "carrier" },
};

function buildApp() {
  const store = createMemoryStore();
  const tariffs = new TariffService({ store, permissions: rolePermissions });
  const app = Fastify();
  registerFreightRoutes(app, {
    getContext: (request) =>
      users[String(request.headers["x-test-user"])] ?? null,
    imports: new ImportService({ store, permissions: rolePermissions }),
    tariffs,
    pricing: new PricingService({ tariffs, permissions: rolePermissions }),
  });
  return app;
}

const csv = "Ref;Fra postnr;Til postnr;Vægt (kg)\nS-1;8300;2680;250\n";
const asStaff = { "x-test-user": "staff" };
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("freight routes", () => {
  it("refuses requests without a signed-in user", async () => {
    const response = await buildApp().inject({
      method: "GET",
      url: "/api/downloads/x",
    });
    expect(response.statusCode).toBe(401);
  });

  it("uploads, processes and downloads a file, and hides it from another organisation", async () => {
    const app = buildApp();
    const upload = await app.inject({
      method: "POST",
      url: "/api/imports?name=shipments.csv",
      headers: { ...asStaff, "content-type": "application/octet-stream" },
      payload: Buffer.from(csv),
    });
    expect(upload.statusCode).toBe(200);
    const { sessionId, inspection } = upload.json();

    await app.inject({
      method: "POST",
      url: `/api/imports/${sessionId}/process`,
      headers: asStaff,
      payload: { mapping: inspection.mapping, format: "csv" },
    });
    await settle();
    const job = await app.inject({
      method: "GET",
      url: `/api/imports/${sessionId}/job`,
      headers: asStaff,
    });
    expect(job.json()).toMatchObject({ state: "completed" });

    const link = await app.inject({
      method: "POST",
      url: `/api/imports/${sessionId}/download`,
      headers: asStaff,
    });
    const file = await app.inject({
      method: "GET",
      url: `/api/downloads/${link.json().token}`,
      headers: asStaff,
    });
    expect(file.headers["content-disposition"]).toContain(
      "shipments-processed.csv",
    );
    expect(file.body).toContain("S-1");

    const spy = await app.inject({
      method: "GET",
      url: `/api/imports/${sessionId}/job`,
      headers: { "x-test-user": "rival" },
    });
    expect(spy.statusCode).toBe(404);
    const stolen = await app.inject({
      method: "GET",
      url: `/api/downloads/${link.json().token}`,
      headers: { "x-test-user": "rival" },
    });
    expect(stolen.statusCode).toBe(404);
  });

  it("rejects a file that is not xlsx or csv with a friendly message", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/api/imports?name=x.csv",
      headers: { ...asStaff, "content-type": "application/octet-stream" },
      payload: Buffer.from([1, 0, 2, 0]),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain(".xlsx or .csv");
  });

  it("rejects unknown fields in a request body", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/api/pricing/compare",
      headers: asStaff,
      payload: { carriers: [], shipment: {}, extra: true },
    });
    expect(response.statusCode).toBe(400);
  });
});
