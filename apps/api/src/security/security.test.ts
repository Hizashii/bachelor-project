// This file proves the security layers: headers, CSRF origin check, rate limit, log redaction, append-only audit.

import { Writable } from "node:stream";
import type { Principal } from "@freight-desk/shared";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { installErrorHandler } from "../http/errorHandler.ts";
import { MemoryStore } from "../storage/memoryStore.ts";
import { createTestKit } from "../testing/helpers.ts";
import { protectAudit } from "./auditGuard.ts";
import { AUTH_LIMIT_PER_MINUTE } from "./rateLimit.ts";
import { loggerOptions, redactValue } from "./redact.ts";

const master: Principal = {
  userId: "m1",
  role: "master",
  carrierCompanyId: null,
};

describe("security headers", () => {
  it("sends the safety headers on every response", async () => {
    const { app } = await createTestKit();
    const res = await app.inject({ url: "/api/health" });
    expect(res.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(res.headers["content-security-policy"]).not.toContain(
      "unsafe-inline",
    );
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});

describe("origin check", () => {
  const login = (headers: Record<string, string>) => ({
    method: "POST" as const,
    url: "/auth/dev-login",
    payload: master,
    headers,
  });

  it("refuses a state-changing request from another site", async () => {
    const { app } = await createTestKit();
    const res = await app.inject(
      login({ origin: "https://evil.example", host: "app.example" }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("accepts the same origin and requests without an origin", async () => {
    const { app } = await createTestKit();
    const same = await app.inject(
      login({ origin: "https://app.example", host: "app.example" }),
    );
    expect(same.statusCode).toBe(200);
    expect((await app.inject(login({}))).statusCode).toBe(200);
  });
});

describe("rate limit", () => {
  it("answers 429 after too many sign-in calls", async () => {
    const { app } = await createTestKit();
    const codes: number[] = [];
    for (let i = 0; i <= AUTH_LIMIT_PER_MINUTE; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/dev-login",
        payload: master,
      });
      codes.push(res.statusCode);
    }
    expect(codes.at(-1)).toBe(429);
    expect(codes[0]).toBe(200);
  });
});

describe("log redaction", () => {
  it("leaves no price, token or cookie in the log output", async () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _enc, done) {
        output += chunk.toString();
        done();
      },
    });
    const app = Fastify({
      logger: { ...(loggerOptions("info") as object), stream },
    });
    installErrorHandler(app);
    app.post("/x", async () => {
      throw new Error("price 98765 token abc");
    });
    await app.inject({
      method: "POST",
      url: "/x?code=SECRETCODE",
      payload: { pricePerKg: 98765 },
      headers: {
        authorization: "Bearer SECRETTOKEN",
        cookie: "fd_session=SECRETCOOKIE",
      },
    });
    for (const leak of [
      "98765",
      "SECRETTOKEN",
      "SECRETCOOKIE",
      "SECRETCODE",
      "price 98765",
    ]) {
      expect(output).not.toContain(leak);
    }
    expect(output).toContain("/x");
  });

  it("redactValue hides secret-looking fields at any depth", () => {
    const out = redactValue({ id: "1", nested: { unitPrice: 5, token: "t" } });
    expect(out).toEqual({
      id: "1",
      nested: { unitPrice: "[redacted]", token: "[redacted]" },
    });
  });
});

describe("audit log is append-only", () => {
  it("refuses to write, replace or move an audit file", async () => {
    const store = protectAudit(new MemoryStore());
    await store.appendLine("audit/2027-01-01.jsonl", "{}");
    await expect(
      store.writeJson("audit/2027-01-01.jsonl", {}, null),
    ).rejects.toThrow();
    await expect(
      store.writeBytes("audit/x.jsonl", new Uint8Array(), null),
    ).rejects.toThrow();
    await expect(
      store.move("audit/2027-01-01.jsonl", "tmp/x"),
    ).rejects.toThrow();
    await expect(store.move("tmp/x", "audit/y.jsonl")).rejects.toThrow();
    await expect(
      store.writeJson("tenders/a.json", {}, null),
    ).resolves.toBeDefined();
  });

  it("offers no delete method on the store", () => {
    const names = Object.keys(protectAudit(new MemoryStore()));
    expect(names.some((name) => /delete|remove|truncate/i.test(name))).toBe(
      false,
    );
  });
});

describe("GET /api/audit", () => {
  it("lets the master page through events and refuses others", async () => {
    const { app, deps, cookieFor } = await createTestKit();
    for (let i = 0; i < 3; i += 1) {
      await deps.audit.record({
        actor: "u",
        role: "master",
        action: `a${i}`,
        thing: "t",
        result: "ok",
      });
    }
    const page = await app.inject({
      url: "/api/audit?limit=2",
      cookies: cookieFor(master),
    });
    const body = page.json();
    expect(body.events).toHaveLength(2);
    expect(body.nextOffset).toBe(2);
    const rest = await app.inject({
      url: "/api/audit?limit=2&offset=2",
      cookies: cookieFor(master),
    });
    expect(rest.json().nextOffset).toBeNull();
    const consultant: Principal = {
      userId: "c",
      role: "consultant",
      carrierCompanyId: null,
    };
    const denied = await app.inject({
      url: "/api/audit",
      cookies: cookieFor(consultant),
    });
    expect(denied.statusCode).toBe(403);
  });
});
