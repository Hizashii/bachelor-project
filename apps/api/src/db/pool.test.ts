// Tests for the database check that runs before the app starts.

import { describe, expect, it } from "vitest";
import {
  type Database,
  DatabaseUnavailableError,
  verifyDatabase,
} from "./pool.ts";

const fakeDatabase = (query: unknown) => ({ query }) as unknown as Database;

describe("verifyDatabase", () => {
  it("explains a database that cannot be reached without showing the connection string", async () => {
    const database = fakeDatabase(async () => {
      throw new Error(
        "connect ECONNREFUSED postgresql://user:secret@db:5432/x",
      );
    });
    const error = await verifyDatabase(database).catch((e) => e);
    expect(error).toBeInstanceOf(DatabaseUnavailableError);
    expect(error.message).not.toContain("secret");
    expect(error.message).toContain("DATABASE_URL");
  });

  it("asks for the migrations when tables are missing", async () => {
    const database = fakeDatabase(async () => ({
      rows: [{ table_name: "organizations" }],
    }));
    await expect(verifyDatabase(database)).rejects.toThrow(/db:migrate/);
  });

  it("accepts a migrated database", async () => {
    const database = fakeDatabase(async () => ({
      rows: [
        { table_name: "organizations" },
        { table_name: "user_accounts" },
        { table_name: "organization_memberships" },
        { table_name: "user_tokens" },
        { table_name: "user_sessions" },
      ],
    }));
    await expect(verifyDatabase(database)).resolves.toBeUndefined();
  });
});
