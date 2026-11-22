// The whole app on a fresh test database with an in-memory storage, plus helpers to add
// users and sign them in through the real login route. Needs TEST_DATABASE_URL.

import { buildApi } from "../app.ts";
import { hashPassword } from "../auth/password.ts";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import type { UserRole } from "../auth/types.ts";
import { type ApiEnvironment, loadApiEnvironment } from "../config/env.ts";
import { Accounts } from "../db/accounts.ts";
import { CredentialStore } from "../db/credentials.ts";
import type { StorageAdapter } from "../storage/types.ts";
import { createMemoryStorage } from "./memoryStorage.ts";
import { freshDatabase, testDatabaseUrl } from "./testDatabase.ts";

export const TEST_PASSWORD = "correct horse battery staple";

export const testEnvironment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
  DATABASE_URL:
    testDatabaseUrl ?? "postgresql://unused:unused@localhost/unused",
  // Tests sign in many times from one address; the rate-limit test sets its own.
  LOGIN_ATTEMPTS_PER_MINUTE: "1000",
});

export async function createTestApp(
  storage: StorageAdapter = createMemoryStorage(),
  environment: ApiEnvironment = testEnvironment,
) {
  const database = await freshDatabase();
  const app = buildApi({ environment, database, storage });
  const accounts = new Accounts(database);
  const credentials = new CredentialStore(database);

  async function addUser(input: {
    email: string;
    role: UserRole;
    carrierId?: string;
    password?: string;
  }) {
    const created = await accounts.createUser({
      email: input.email,
      displayName: input.email,
      role: input.role,
      carrierId: input.carrierId,
    });
    await credentials.setPassword(
      created.id,
      await hashPassword(input.password ?? TEST_PASSWORD),
    );
    return created;
  }

  // Signs in through POST /auth/login and returns the headers a browser would send.
  async function login(email: string, password = TEST_PASSWORD) {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: testEnvironment.APP_ORIGIN },
      payload: { email, password },
    });
    const cookies = [response.headers["set-cookie"]]
      .flat()
      .map((c) => String(c).split(";", 1)[0]);
    const session =
      cookies.find((c) => c?.startsWith(`${SESSION_COOKIE}=`)) ?? "";
    const csrf = session
      ? (
          await app.inject({
            method: "GET",
            url: "/api/csrf",
            headers: { cookie: session },
          })
        ).json().token
      : "";
    return {
      status: response.statusCode,
      headers: {
        cookie: session,
        origin: testEnvironment.APP_ORIGIN,
        "x-csrf-token": csrf as string,
      },
    };
  }

  return { app, database, storage, accounts, credentials, addUser, login };
}
