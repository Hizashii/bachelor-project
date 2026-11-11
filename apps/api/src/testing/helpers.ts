// This file gives tests a ready server with a fake file library, a fixed clock and sign-in cookies.
// It is for tests only.

import type { Principal } from "@freight-desk/shared";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.ts";
import { AuditLog } from "../audit/audit.ts";
import { issueSession, SESSION_COOKIE } from "../auth/session.ts";
import { randomIds } from "../clock.ts";
import type { AppDeps } from "../deps.ts";
import { MemoryMailer } from "../mail.ts";
import { MemoryStore } from "../storage/memoryStore.ts";

export const TEST_SECRET = "test-secret-test-secret-test-secret";

export type TestKit = {
  app: FastifyInstance;
  deps: AppDeps;
  store: MemoryStore;
  mailer: MemoryMailer;
  setNow(iso: string): void;
  cookieFor(principal: Principal): Record<string, string>;
};

export async function createTestKit(
  startIso = "2027-01-01T00:00:00Z",
): Promise<TestKit> {
  let now = new Date(startIso);
  const clock = { now: () => now };
  const store = new MemoryStore();
  const mailer = new MemoryMailer();
  const deps: AppDeps = {
    store,
    audit: new AuditLog(store, clock),
    clock,
    ids: randomIds,
    mailer,
    config: { sessionSecret: TEST_SECRET, devLogin: true },
  };
  const app = await buildApp(deps);
  return {
    app,
    deps,
    store,
    mailer,
    setNow: (iso) => {
      now = new Date(iso);
    },
    cookieFor: (principal) => ({
      [SESSION_COOKIE]: issueSession(principal, TEST_SECRET, now),
    }),
  };
}
