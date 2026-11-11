import { describe, expect, it } from "vitest";
import { buildApi } from "../app.ts";
import type { ApiEnvironment } from "../config/env.ts";
import {
  canAccessCompany,
  canAccessOffer,
  canAccessTender,
} from "./authorization.ts";
import { InMemoryUserDirectory } from "./directory.ts";
import { AuthService } from "./service.ts";
import { InMemorySessionStore } from "./sessions.ts";

const testEnvironment: ApiEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 3000,
  APP_ORIGIN: "http://localhost:4173",
  AUTH_MODE: "mock",
  COOKIE_SECURE: true,
  SESSION_SECRET: "test-session-secret-that-is-long-enough",
  SESSION_TTL_SECONDS: 300,
  AUTHORIZED_USERS_JSON: undefined,
  ENTRA_TENANT_ID: undefined,
  ENTRA_CLIENT_ID: undefined,
  ENTRA_CLIENT_SECRET: undefined,
  ENTRA_REDIRECT_URI: "http://localhost:4173/auth/callback",
  ENTRA_POST_LOGOUT_REDIRECT_URI: "http://localhost:4173/login",
  ENTRA_SCOPES: "openid profile email",
};

function rawCookieHeader(response: { headers: unknown }): string {
  const headers = response.headers as { [key: string]: unknown };
  const setCookie = headers["set-cookie"];
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof firstCookie !== "string")
    throw new Error("The response did not set a session cookie.");
  return firstCookie;
}

function cookieHeader(response: { headers: unknown }): string {
  return rawCookieHeader(response).split(";", 1)[0];
}

describe("Freight Desk authentication", () => {
  it("returns no profile without a valid server-side session", async () => {
    const api = buildApi({ environment: testEnvironment });
    const response = await api.inject({ method: "GET", url: "/api/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it("keeps carrier access inside the provisioned company", async () => {
    const api = buildApi({ environment: testEnvironment });
    const login = await api.inject({
      method: "GET",
      url: "/auth/mock/login?identity=carrier",
    });
    const cookie = cookieHeader(login);
    expect(rawCookieHeader(login)).toContain("HttpOnly");
    expect(rawCookieHeader(login)).toContain("Secure");
    expect(rawCookieHeader(login)).toContain("SameSite=Lax");

    const ownCompany = await api.inject({
      method: "GET",
      url: "/api/companies/carrier-blue-fjord",
      headers: { cookie },
    });
    const otherCompany = await api.inject({
      method: "GET",
      url: "/api/companies/carrier-northstar",
      headers: { cookie },
    });

    expect(ownCompany.statusCode).toBe(200);
    expect(otherCompany.statusCode).toBe(403);
  });

  it("does not allow a carrier to escalate through a request role value", async () => {
    const api = buildApi({ environment: testEnvironment });
    const login = await api.inject({
      method: "GET",
      url: "/auth/mock/login?identity=carrier",
    });
    const cookie = cookieHeader(login);

    const profile = await api.inject({
      method: "GET",
      url: "/api/me?role=master",
      headers: { cookie, "x-role": "master" },
    });
    const masterRoute = await api.inject({
      method: "GET",
      url: "/api/master/authorization-check",
      headers: { cookie },
    });

    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.role).toBe("carrier");
    expect(masterRoute.statusCode).toBe(403);
  });

  it("rejects missing roles and grants the master guard only to master users", async () => {
    const api = buildApi({ environment: testEnvironment });
    const consultantLogin = await api.inject({
      method: "GET",
      url: "/auth/mock/login?identity=consultant",
    });
    const masterLogin = await api.inject({
      method: "GET",
      url: "/auth/mock/login?identity=master",
    });

    const consultant = await api.inject({
      method: "GET",
      url: "/api/master/authorization-check",
      headers: { cookie: cookieHeader(consultantLogin) },
    });
    const master = await api.inject({
      method: "GET",
      url: "/api/master/authorization-check",
      headers: { cookie: cookieHeader(masterLogin) },
    });

    expect(consultant.statusCode).toBe(403);
    expect(master.statusCode).toBe(200);
  });

  it("expires server-side sessions without trusting cookie contents", async () => {
    let now = 10_000;
    const sessions = new InMemorySessionStore(
      testEnvironment.SESSION_SECRET,
      () => now,
    );
    const created = await sessions.create("user-consultant-demo", 300);
    const api = buildApi({ environment: testEnvironment, sessions });

    now += 301_000;
    const response = await api.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: `freight_desk_session=${created.cookieValue}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("requires same-origin CSRF protection for logout", async () => {
    const api = buildApi({ environment: testEnvironment });
    const login = await api.inject({
      method: "GET",
      url: "/auth/mock/login?identity=consultant",
    });
    const cookie = cookieHeader(login);
    const csrf = await api.inject({
      method: "GET",
      url: "/api/csrf",
      headers: { cookie },
    });
    const token = csrf.json().token as string;

    const missingCsrf = await api.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie, origin: testEnvironment.APP_ORIGIN },
    });
    const loggedOut = await api.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie,
        origin: testEnvironment.APP_ORIGIN,
        "x-csrf-token": token,
      },
    });
    const profileAfterLogout = await api.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });

    expect(missingCsrf.statusCode).toBe(403);
    expect(loggedOut.statusCode).toBe(200);
    expect(profileAfterLogout.statusCode).toBe(401);
  });
});

describe("resource authorization helpers", () => {
  const carrier = { role: "carrier" as const, companyId: "carrier-blue-fjord" };
  const consultant = { role: "consultant" as const, companyId: null };

  it("enforces company ownership and shared tender/offer boundaries", () => {
    expect(canAccessCompany(carrier, "carrier-blue-fjord")).toBe(true);
    expect(canAccessCompany(carrier, "carrier-northstar")).toBe(false);
    expect(
      canAccessTender(carrier, {
        invitedCarrierCompanyIds: ["carrier-northstar"],
      }),
    ).toBe(false);
    expect(
      canAccessTender(carrier, {
        invitedCarrierCompanyIds: ["carrier-blue-fjord"],
      }),
    ).toBe(true);
    expect(
      canAccessOffer(carrier, { carrierCompanyId: "carrier-northstar" }),
    ).toBe(false);
    expect(
      canAccessOffer(consultant, { carrierCompanyId: "carrier-northstar" }),
    ).toBe(true);
  });
});

describe("trusted directory validation", () => {
  it("rejects a carrier record without a validated company", () => {
    expect(
      () =>
        new InMemoryUserDirectory([
          {
            id: "invalid-carrier",
            subject: "invalid-subject",
            tenantId: "tenant",
            email: "carrier@example.invalid",
            displayName: "Invalid Carrier",
            role: "carrier",
            companyId: null,
            active: true,
          },
        ]),
    ).toThrow("validated carrier company");
  });

  it("requires MFA evidence for Entra sessions", async () => {
    const environment = { ...testEnvironment, AUTH_MODE: "entra" as const };
    const auth = new AuthService({
      environment,
      directory: new InMemoryUserDirectory(),
      sessions: new InMemorySessionStore(environment.SESSION_SECRET),
    });

    await expect(
      auth.createSession({
        subject: "mock-subject-consultant",
        tenantId: "mock-tenant",
        email: "consultant.user@demo.freightdesk.test",
        displayName: "Consultant Demo User",
        mfaVerified: false,
      }),
    ).rejects.toMatchObject({
      code: "mfa_required",
      statusCode: 403,
    });
  });
});
