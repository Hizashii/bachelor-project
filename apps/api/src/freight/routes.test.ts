// HTTP-level tests through the whole app: sign-in and CSRF are required, upload to download
// works for staff, carriers only reach their own tariffs, and rival data stays hidden.

import { describe, expect, it } from "vitest";
import { buildApi } from "../app.ts";
import { InMemoryUserDirectory } from "../auth/directory.ts";
import { InMemorySessionStore, SESSION_COOKIE } from "../auth/sessions.ts";
import type { TrustedDirectoryUser } from "../auth/types.ts";
import { loadApiEnvironment } from "../config/env.ts";
import { createMemoryStorage } from "../testing/memoryStorage.ts";
import { waitFor } from "../testing/waitFor.ts";

const environment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
  AUTH_MODE: "mock",
});

const person = (
  id: string,
  role: TrustedDirectoryUser["role"],
  companyId: string | null,
): TrustedDirectoryUser => ({
  id,
  subject: id,
  tenantId: "test",
  email: `${id}@example.test`,
  displayName: id,
  role,
  companyId,
  active: true,
});

const users = {
  staff: person("staff", "consultant", null),
  carrierA: person("carrier-a-user", "carrier", "carrier-blue-fjord"),
  carrierB: person("carrier-b-user", "carrier", "carrier-northstar"),
};

async function buildApp() {
  const sessions = new InMemorySessionStore(environment.SESSION_SECRET);
  const app = buildApi({
    environment,
    storage: createMemoryStorage(),
    sessions,
    directory: new InMemoryUserDirectory(Object.values(users)),
  });
  const headersFor = async (user: keyof typeof users) => {
    const { cookieValue, record } = await sessions.create(users[user].id, 600);
    return {
      cookie: `${SESSION_COOKIE}=${cookieValue}`,
      origin: environment.APP_ORIGIN,
      "x-csrf-token": record.csrfToken,
    };
  };
  return { app, headersFor };
}

const csv = "Ref;Fra postnr;Til postnr;Vægt (kg)\nS-1;8300;2680;250\n";
const octet = { "content-type": "application/octet-stream" };

const tariffBody = (organisationId: string) => ({
  tariff: {
    tariffId: "t-1",
    version: 1,
    carrierOrganisationId: organisationId,
    status: "draft",
    currency: "DKK",
    method: "per_100kg",
    postcodeLength: 4,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    zones: [{ id: "z1", name: "Zone A", ranges: [{ from: "00", to: "99" }] }],
    brackets: [{ from: 0, to: null }],
    rates: [{ zoneId: "z1", bracketIndex: 0, amountMinor: 20_000 }],
    quantityStep: null,
    minimumChargeMinor: null,
    roundingStepMinor: 1,
    discounts: [],
    surcharges: [],
    restrictions: {
      maxWeightKg: null,
      maxPallets: null,
      maxLoadingMeters: null,
      maxCubicMeters: null,
      originRanges: [],
    },
    sourceFile: null,
    createdAt: "2026-03-01T10:00:00Z",
    createdBy: "x",
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
  },
});

describe("freight routes", () => {
  it("refuses requests without a signed-in user", async () => {
    const { app } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/carriers" });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a change without the CSRF token", async () => {
    const { app, headersFor } = await buildApp();
    const { "x-csrf-token": _token, ...withoutToken } =
      await headersFor("staff");
    const response = await app.inject({
      method: "POST",
      url: "/api/imports?name=x.csv",
      headers: { ...withoutToken, ...octet },
      payload: Buffer.from(csv),
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets staff upload, process and download a file, and hides it from carriers", async () => {
    const { app, headersFor } = await buildApp();
    const staff = await headersFor("staff");
    const upload = await app.inject({
      method: "POST",
      url: "/api/imports?name=shipments.csv",
      headers: { ...staff, ...octet },
      payload: Buffer.from(csv),
    });
    expect(upload.statusCode).toBe(200);
    const { sessionId, inspection } = upload.json();

    await app.inject({
      method: "POST",
      url: `/api/imports/${sessionId}/process`,
      headers: staff,
      payload: { mapping: inspection.mapping, format: "csv" },
    });
    await waitFor(async () => {
      const state = (
        await app.inject({
          method: "GET",
          url: `/api/imports/${sessionId}/job`,
          headers: staff,
        })
      ).json().state;
      return state === "completed" || state === "failed";
    });
    const job = await app.inject({
      method: "GET",
      url: `/api/imports/${sessionId}/job`,
      headers: staff,
    });
    expect(job.json()).toMatchObject({ state: "completed" });

    const link = await app.inject({
      method: "POST",
      url: `/api/imports/${sessionId}/download`,
      headers: staff,
    });
    const file = await app.inject({
      method: "GET",
      url: `/api/downloads/${link.json().token}`,
      headers: staff,
    });
    expect(file.headers["content-disposition"]).toContain(
      "shipments-processed.csv",
    );
    expect(file.body).toContain("S-1");

    const carrier = await headersFor("carrierA");
    const spy = await app.inject({
      method: "GET",
      url: `/api/imports/${sessionId}/job`,
      headers: carrier,
    });
    expect(spy.statusCode).toBe(404);
    const stolen = await app.inject({
      method: "GET",
      url: `/api/downloads/${link.json().token}`,
      headers: carrier,
    });
    expect(stolen.statusCode).toBe(404);
  });

  it("rejects a file that is not xlsx or csv with a friendly message", async () => {
    const { app, headersFor } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/imports?name=x.csv",
      headers: { ...(await headersFor("staff")), ...octet },
      payload: Buffer.from([1, 0, 2, 0]),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain(".xlsx or .csv");
  });

  it("rejects unknown fields in a request body", async () => {
    const { app, headersFor } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/pricing/compare",
      headers: await headersFor("staff"),
      payload: { carriers: [], shipment: {}, extra: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it("keeps carrier tariffs apart and lets only staff approve and compare", async () => {
    const { app, headersFor } = await buildApp();
    const carrierA = await headersFor("carrierA");
    const carrierB = await headersFor("carrierB");
    const staff = await headersFor("staff");

    const saved = await app.inject({
      method: "PUT",
      url: "/api/tariffs",
      headers: carrierA,
      payload: tariffBody("carrier-blue-fjord"),
    });
    expect(saved.statusCode).toBe(200);

    const intoRival = await app.inject({
      method: "PUT",
      url: "/api/tariffs",
      headers: carrierB,
      payload: tariffBody("carrier-blue-fjord"),
    });
    expect(intoRival.statusCode).toBe(403);

    const submit = await app.inject({
      method: "POST",
      url: "/api/tariffs/carrier-blue-fjord/t-1/1/submit",
      headers: carrierA,
    });
    expect(submit.statusCode).toBe(200);
    const selfApprove = await app.inject({
      method: "POST",
      url: "/api/tariffs/carrier-blue-fjord/t-1/1/approve",
      headers: carrierA,
    });
    expect(selfApprove.statusCode).toBe(403);

    for (const step of ["approve", "activate"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/tariffs/carrier-blue-fjord/t-1/1/${step}`,
        headers: staff,
      });
      expect(response.statusCode).toBe(200);
    }

    const carriers = await app.inject({
      method: "GET",
      url: "/api/carriers",
      headers: staff,
    });
    expect(carriers.json()).toEqual([
      { organisationId: "carrier-blue-fjord", name: "carrier-blue-fjord" },
    ]);
    const compare = await app.inject({
      method: "POST",
      url: "/api/pricing/compare",
      headers: staff,
      payload: {
        carriers: [{ organisationId: "carrier-blue-fjord" }],
        shipment: {
          originPostcode: "8300",
          destinationPostcode: "2680",
          date: "2026-03-05",
          weightKg: 250,
          pallets: null,
          loadingMeters: null,
          cubicMeters: null,
        },
      },
    });
    expect(compare.json()[0].result).toMatchObject({
      status: "priced",
      totalMinor: 50_000,
    });

    const carrierCompare = await app.inject({
      method: "POST",
      url: "/api/pricing/compare",
      headers: carrierB,
      payload: {
        carriers: [{ organisationId: "carrier-blue-fjord" }],
        shipment: {
          originPostcode: "8300",
          destinationPostcode: "2680",
          date: "2026-03-05",
          weightKg: 250,
          pallets: null,
          loadingMeters: null,
          cubicMeters: null,
        },
      },
    });
    expect(carrierCompare.json()[0].result).toEqual({ status: "denied" });
  });

  it("reads a carrier rate sheet into a grid for the signed-in carrier only", async () => {
    const { app, headersFor } = await buildApp();
    const grid = [
      "Pris pr. 100 kg;Zone A (00-26)",
      "0-100;200,50",
      "100+;",
      "",
    ].join("\n");
    const response = await app.inject({
      method: "POST",
      url: "/api/tariffs/import?name=rates.csv",
      headers: { ...(await headersFor("carrierA")), ...octet },
      payload: Buffer.from(grid),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      suggestedMethod: "per_100kg",
      rates: [{ amountMinor: 20050 }, { amountMinor: null }],
      ambiguities: [{ code: "blank_rate" }],
    });
  });
});
