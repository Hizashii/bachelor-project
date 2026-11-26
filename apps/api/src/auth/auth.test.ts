// Sign-in with e-mail and password against a real PostgreSQL: login, lockout, sessions,
// CSRF, invitations, password reset and change. Skipped unless TEST_DATABASE_URL is set.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../app.ts";
import {
  createTestApp,
  TEST_PASSWORD,
  testEnvironment,
} from "../testing/testApp.ts";
import { testDatabaseUrl } from "../testing/testDatabase.ts";
import { INVITATION_HOURS, MAX_FAILED_LOGINS } from "./service.ts";

const origin = { origin: testEnvironment.APP_ORIGIN };
const NEW_PASSWORD = "another long passphrase 42";

function tokenOf(link: string): string {
  return new URL(link).searchParams.get("token") ?? "";
}

describe.skipIf(!testDatabaseUrl)("password sign-in", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let carrierId: string;

  beforeAll(async () => {
    t = await createTestApp();
    carrierId = (await t.accounts.createCarrier("Blue Fjord ApS", "Blue Fjord"))
      .id;
    await t.addUser({ email: "staff@example.test", role: "consultant" });
    await t.addUser({ email: "boss@example.test", role: "master" });
    await t.addUser({
      email: "dana@bluefjord.test",
      role: "carrier",
      carrierId,
    });
  });
  afterAll(() => t.database.end());

  const post = (
    url: string,
    payload: Record<string, unknown>,
    headers: Record<string, string> = origin,
  ) => t.app.inject({ method: "POST", url, headers, payload });

  it("signs in with the right password and shows the server-side role and company", async () => {
    const { status, headers } = await t.login("Dana@BlueFjord.test");
    expect(status).toBe(200);
    const me = await t.app.inject({ method: "GET", url: "/api/me", headers });
    expect(me.json().user).toMatchObject({
      role: "carrier",
      companyId: carrierId,
    });
    expect(me.json().user).not.toHaveProperty("passwordHash");
  });

  it("gives the same answer for a wrong password and an unknown e-mail", async () => {
    const wrong = await post("/auth/login", {
      email: "staff@example.test",
      password: "not the password",
    });
    const unknown = await post("/auth/login", {
      email: "nobody@example.test",
      password: "not the password",
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("sets an HttpOnly session cookie and refuses a login from another site", async () => {
    const ok = await post("/auth/login", {
      email: "staff@example.test",
      password: TEST_PASSWORD,
    });
    expect(String(ok.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect(String(ok.headers["set-cookie"])).toMatch(/SameSite=Strict/i);
    const foreign = await post(
      "/auth/login",
      { email: "staff@example.test", password: TEST_PASSWORD },
      { origin: "https://evil.example.test" },
    );
    expect(foreign.statusCode).toBe(403);
    const missingOrigin = await post(
      "/auth/login",
      { email: "staff@example.test", password: TEST_PASSWORD },
      {},
    );
    expect(missingOrigin.statusCode).toBe(403);
  });

  it("locks an account after repeated wrong passwords, even for the right one", async () => {
    await t.addUser({ email: "locked@example.test", role: "consultant" });
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      await post("/auth/login", {
        email: "locked@example.test",
        password: "wrong password here",
      });
    }
    const right = await post("/auth/login", {
      email: "locked@example.test",
      password: TEST_PASSWORD,
    });
    expect(right.statusCode).toBe(401);
  });

  it("rate-limits login attempts from one address", async () => {
    const strict = buildApi({
      environment: { ...testEnvironment, LOGIN_ATTEMPTS_PER_MINUTE: 5 },
      database: t.database,
      storage: t.storage,
    });
    const codes: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const response = await strict.inject({
        method: "POST",
        url: "/auth/login",
        headers: origin,
        payload: { email: "x@example.test", password: "nope nope nope" },
      });
      codes.push(response.statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes.slice(5)).toEqual([429, 429, 429]);
  });

  it("refuses a disabled account and ends its session at once", async () => {
    const created = await t.addUser({
      email: "temp@example.test",
      role: "consultant",
    });
    const { headers } = await t.login("temp@example.test");
    await t.accounts.setUserStatus(created.id, "suspended");
    const after = await t.app.inject({
      method: "GET",
      url: "/api/me",
      headers,
    });
    expect(after.statusCode).toBe(401);
    const again = await post("/auth/login", {
      email: "temp@example.test",
      password: TEST_PASSWORD,
    });
    expect(again.statusCode).toBe(403);
  });

  it("logs out only with the CSRF token, and the old cookie stops working", async () => {
    const { headers } = await t.login("staff@example.test");
    const { "x-csrf-token": _token, ...withoutCsrf } = headers;
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: withoutCsrf,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await t.app.inject({ method: "POST", url: "/auth/logout", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await t.app.inject({ method: "GET", url: "/api/me", headers }))
        .statusCode,
    ).toBe(401);
  });

  it("rejects an expired session", async () => {
    const created = await t.credentials.findByEmail("staff@example.test");
    const session = await new (await import("./sessions.ts")).SessionStore(
      t.database,
    ).create(created?.user.id ?? "", 1);
    await t.database.query(
      "UPDATE user_sessions SET expires_at = now() - interval '1 minute'",
    );
    const response = await t.app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: `freight_desk_session=${session.cookieValue}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("invites a new employee: the link works once and sets the first password", async () => {
    const admin = await t.login("boss@example.test");
    const created = await t.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: admin.headers,
      payload: {
        email: "new@example.test",
        displayName: "New Person",
        role: "consultant",
      },
    });
    expect(created.statusCode).toBe(201);
    const token = tokenOf(created.json().invitationLink);
    expect(
      (
        await post("/auth/login", {
          email: "new@example.test",
          password: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(401);

    expect(
      (await post("/auth/accept-invitation", { token, password: "short" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post("/auth/accept-invitation", { token, password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post("/auth/accept-invitation", { token, password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post("/auth/login", {
          email: "new@example.test",
          password: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(200);
  });

  it("registers a carrier with a new company who can then sign in as a carrier", async () => {
    const payload = {
      companyName: "Green Fjord ApS",
      displayName: "Gry Green",
      email: "gry@greenfjord.test",
      password: NEW_PASSWORD,
    };
    expect((await post("/auth/register", payload)).statusCode).toBe(201);
    const signedIn = await post("/auth/login", {
      email: payload.email,
      password: NEW_PASSWORD,
    });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().user.role).toBe("carrier");
    expect((await post("/auth/register", payload)).statusCode).toBe(409);
    expect(
      (
        await post("/auth/register", {
          ...payload,
          email: "x@y.test",
          password: "short",
        })
      ).statusCode,
    ).toBe(400);
    expect((await post("/auth/register", payload, {})).statusCode).toBe(403);
  });

  it("does not accept an expired invitation or a made-up token", async () => {
    const admin = await t.login("boss@example.test");
    const created = await t.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: admin.headers,
      payload: {
        email: "late@example.test",
        displayName: "Late",
        role: "consultant",
      },
    });
    await t.database.query(
      "UPDATE user_tokens SET expires_at = now() - interval '1 hour'",
    );
    const token = tokenOf(created.json().invitationLink);
    expect(
      (await post("/auth/accept-invitation", { token, password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post("/auth/accept-invitation", {
          token: "x".repeat(43),
          password: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(400);
    expect(INVITATION_HOURS).toBeGreaterThan(0);
  });

  it("resets a password with an administrator's link and ends the old sessions", async () => {
    const admin = await t.login("boss@example.test");
    const dana = await t.login("dana@bluefjord.test");
    const users = (
      await t.app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: admin.headers,
      })
    ).json();
    const danaId = users.find(
      (u: { email: string }) => u.email === "dana@bluefjord.test",
    ).id;
    const reset = await t.app.inject({
      method: "POST",
      url: `/api/admin/users/${danaId}/password-reset`,
      headers: admin.headers,
    });
    const token = tokenOf(reset.json().link);
    expect(
      (await post("/auth/reset-password", { token, password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await t.app.inject({
          method: "GET",
          url: "/api/me",
          headers: dana.headers,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await post("/auth/login", {
          email: "dana@bluefjord.test",
          password: TEST_PASSWORD,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await post("/auth/login", {
          email: "dana@bluefjord.test",
          password: NEW_PASSWORD,
        })
      ).statusCode,
    ).toBe(200);
  });

  it("changes a password only with the current one, then requires a new login", async () => {
    const { headers } = await t.login("staff@example.test");
    const wrong = await t.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers,
      payload: {
        currentPassword: "not my password",
        newPassword: NEW_PASSWORD,
      },
    });
    expect(wrong.statusCode).toBe(403);
    const ok = await t.app.inject({
      method: "POST",
      url: "/api/me/password",
      headers,
      payload: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await t.app.inject({ method: "GET", url: "/api/me", headers }))
        .statusCode,
    ).toBe(401);
    expect((await t.login("staff@example.test", NEW_PASSWORD)).status).toBe(
      200,
    );
  });

  it("keeps administration for masters: staff and carriers are refused", async () => {
    const carrier = await t.login("dana@bluefjord.test", NEW_PASSWORD);
    const staff = await t.login("staff@example.test", NEW_PASSWORD);
    for (const who of [carrier, staff]) {
      expect(
        (
          await t.app.inject({
            method: "GET",
            url: "/api/admin/users",
            headers: who.headers,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (await t.app.inject({ method: "GET", url: "/api/admin/users" }))
        .statusCode,
    ).toBe(401);
  });

  it("stops an administrator from suspending themselves or the last administrator", async () => {
    const admin = await t.login("boss@example.test");
    const users = (
      await t.app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: admin.headers,
      })
    ).json();
    const bossId = users.find(
      (u: { email: string }) => u.email === "boss@example.test",
    ).id;
    const response = await t.app.inject({
      method: "PATCH",
      url: `/api/admin/users/${bossId}`,
      headers: admin.headers,
      payload: { status: "suspended" },
    });
    expect(response.statusCode).toBe(409);
  });
});
