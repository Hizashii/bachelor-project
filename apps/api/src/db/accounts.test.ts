// Tests against a real PostgreSQL database: companies, accounts, memberships, suspension and
// carrier/staff separation. Skipped unless TEST_DATABASE_URL is set.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { freshDatabase, testDatabaseUrl } from "../testing/testDatabase.ts";
import { AccountError, Accounts } from "./accounts.ts";
import { CredentialStore } from "./credentials.ts";
import { applyMigrations } from "./migrate.ts";
import type { createDatabase } from "./pool.ts";

describe.skipIf(!testDatabaseUrl)("accounts in PostgreSQL", () => {
  let database: ReturnType<typeof createDatabase>;
  let accounts: Accounts;
  let credentials: CredentialStore;

  beforeEach(async () => {
    await database?.end();
    database = await freshDatabase();
    accounts = new Accounts(database);
    credentials = new CredentialStore(database);
  });
  afterAll(() => database?.end());

  it("applies each migration once", async () => {
    expect(await applyMigrations(database)).toEqual([]);
  });

  it("finds an administrator by e-mail in any letter case, before they have a password", async () => {
    await accounts.provisionAdministrator("Boss@Example.test", "The Boss");
    const found = await credentials.findByEmail("boss@example.TEST");
    expect(found?.user).toMatchObject({
      role: "master",
      companyId: null,
      active: true,
    });
    expect(found?.passwordHash).toBeNull();
    expect(await credentials.findByEmail("nobody@example.test")).toBeNull();
  });

  it("looks up a carrier user with their company and lists real carrier names", async () => {
    const carrier = await accounts.createCarrier(
      "Blue Fjord Transport ApS",
      "Blue Fjord",
    );
    const created = await accounts.createUser({
      email: "driver@bluefjord.test",
      displayName: "Dana",
      role: "carrier",
      carrierId: carrier.id,
    });
    expect(await credentials.findById(created.id)).toMatchObject({
      role: "carrier",
      companyId: carrier.id,
      active: true,
    });
    expect(await accounts.activeCarriers()).toEqual([
      { organisationId: carrier.id, name: "Blue Fjord" },
    ]);
  });

  it("makes a suspended user or a suspended carrier company inactive at once", async () => {
    const carrier = await accounts.createCarrier("Northstar A/S", "Northstar");
    const created = await accounts.createUser({
      email: "ops@northstar.test",
      displayName: "Ops",
      role: "carrier",
      carrierId: carrier.id,
    });
    await accounts.setUserStatus(created.id, "suspended");
    expect((await credentials.findById(created.id))?.active).toBe(false);
    await accounts.setUserStatus(created.id, "active");
    expect((await credentials.findById(created.id))?.active).toBe(true);

    await accounts.setCarrierStatus(carrier.id, "suspended");
    expect((await credentials.findById(created.id))?.active).toBe(false);
    expect(await accounts.activeCarriers()).toEqual([]);
  });

  it("keeps carrier and staff accounts apart and e-mail addresses unique", async () => {
    const carrier = await accounts.createCarrier("A", "A");
    await expect(
      accounts.createUser({
        email: "a@example.test",
        displayName: "A",
        role: "carrier",
      }),
    ).rejects.toBeInstanceOf(AccountError);
    await expect(
      accounts.createUser({
        email: "b@example.test",
        displayName: "B",
        role: "consultant",
        carrierId: carrier.id,
      }),
    ).rejects.toBeInstanceOf(AccountError);
    await accounts.createUser({
      email: "c@example.test",
      displayName: "C",
      role: "consultant",
    });
    await expect(
      accounts.createUser({
        email: "C@example.test",
        displayName: "C2",
        role: "consultant",
      }),
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("stops an administrator from locking everyone out", async () => {
    const boss = await accounts.provisionAdministrator(
      "boss@example.test",
      "Boss",
    );
    await expect(
      accounts.setUserStatus(boss.id, "suspended", boss.id),
    ).rejects.toThrow(/yourself/);
    const other = await accounts.createUser({
      email: "c@example.test",
      displayName: "C",
      role: "consultant",
    });
    await expect(
      accounts.setUserStatus(boss.id, "suspended", other.id),
    ).rejects.toThrow(/administrator must remain/);
    const second = await accounts.createUser({
      email: "m2@example.test",
      displayName: "M2",
      role: "master",
    });
    await accounts.setUserStatus(boss.id, "suspended", second.id);
  });

  it("stores only a hash of invitation links, and each link works once", async () => {
    const boss = await accounts.provisionAdministrator(
      "boss@example.test",
      "Boss",
    );
    const token = await credentials.issueLink(boss.id, "invitation", 1);
    const stored = await database.query<{ token_hash: string }>(
      "SELECT token_hash FROM user_tokens",
    );
    expect(stored.rows[0]?.token_hash).not.toBe(token);
    expect(await credentials.useLink(token, "password_reset")).toBeNull();
    expect(await credentials.useLink(token, "invitation")).toBe(boss.id);
    expect(await credentials.useLink(token, "invitation")).toBeNull();
  });
});
