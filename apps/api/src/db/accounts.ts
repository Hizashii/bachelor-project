// Creating and managing carrier companies and user accounts in PostgreSQL.
// Used by the administrator routes and by the one-time first-administrator command.

import { randomUUID } from "node:crypto";
import type { UserRole } from "../auth/types.ts";
import type { Database } from "./pool.ts";

export type CarrierOrganisation = {
  id: string;
  displayName: string;
  status: "active" | "suspended" | "archived";
};

export type NewUser = {
  email: string;
  displayName: string;
  role: UserRole;
  // Required for carriers and must name an existing active carrier company.
  carrierId?: string;
};

export type AccountSummary = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  carrierId: string | null;
  status: "active" | "suspended";
  hasPassword: boolean;
};

export class AccountError extends Error {}

const CONSULTANCY_NAME = "Slinkert & Aarøe";

export class Accounts {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async listCarriers(): Promise<CarrierOrganisation[]> {
    const { rows } = await this.database.query<{
      id: string;
      display_name: string;
      status: CarrierOrganisation["status"];
    }>(
      `SELECT id, display_name, status FROM organizations
       WHERE kind = 'carrier' ORDER BY display_name`,
    );
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      status: row.status,
    }));
  }

  // The carriers that can be compared: active companies only.
  async activeCarriers(): Promise<{ organisationId: string; name: string }[]> {
    return (await this.listCarriers())
      .filter((carrier) => carrier.status === "active")
      .map((carrier) => ({
        organisationId: carrier.id,
        name: carrier.displayName,
      }));
  }

  async createCarrier(legalName: string, displayName: string) {
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO organizations (id, kind, legal_name, display_name)
       VALUES ($1, 'carrier', $2, $3)`,
      [id, legalName, displayName],
    );
    return { id, displayName };
  }

  async setCarrierStatus(id: string, status: CarrierOrganisation["status"]) {
    const result = await this.database.query(
      `UPDATE organizations SET status = $2, updated_at = now()
       WHERE id = $1 AND kind = 'carrier'`,
      [id, status],
    );
    if (result.rowCount === 0) throw new AccountError("Carrier not found.");
  }

  async listUsers(): Promise<AccountSummary[]> {
    const { rows } = await this.database.query<{
      id: string;
      email: string;
      display_name: string | null;
      role: UserRole;
      carrier_company_id: string | null;
      status: AccountSummary["status"];
      has_password: boolean;
    }>(
      `SELECT u.id, u.email, u.display_name, m.role, m.carrier_company_id,
              u.status, (u.password_hash IS NOT NULL) AS has_password
       FROM user_accounts u
       JOIN organization_memberships m ON m.user_account_id = u.id
       ORDER BY u.email`,
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      carrierId: row.carrier_company_id,
      status: row.status,
      hasPassword: row.has_password,
    }));
  }

  // The user has no password yet; an invitation link lets them choose one.
  async createUser(input: NewUser): Promise<{ id: string }> {
    const isCarrier = input.role === "carrier";
    if (isCarrier !== (input.carrierId !== undefined)) {
      throw new AccountError("Only carriers belong to a carrier company.");
    }
    const organisationId = isCarrier
      ? await this.activeCarrierId(input.carrierId ?? "")
      : await this.consultancyId();
    const id = randomUUID();
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO user_accounts (id, email, display_name) VALUES ($1, $2, $3)`,
        [id, input.email.trim(), input.displayName.trim()],
      );
      await client.query(
        `INSERT INTO organization_memberships
           (id, user_account_id, organization_id, organization_kind, role,
            carrier_company_id, carrier_company_kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          id,
          organisationId,
          isCarrier ? "carrier" : "consultancy",
          input.role,
          isCarrier ? organisationId : null,
          isCarrier ? "carrier" : null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new AccountError(
          "A user with that e-mail address already exists.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
    return { id };
  }

  // Nobody can suspend themselves or the last active administrator.
  async setUserStatus(
    id: string,
    status: AccountSummary["status"],
    actorId?: string,
  ) {
    if (status === "suspended") await this.assertNotLockout(id, actorId);
    const result = await this.database.query(
      `UPDATE user_accounts SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
    if (result.rowCount === 0) throw new AccountError("User not found.");
  }

  private async assertNotLockout(id: string, actorId?: string) {
    if (id === actorId) throw new AccountError("You cannot suspend yourself.");
    const others = await this.database.query(
      `SELECT 1 FROM user_accounts u
       JOIN organization_memberships m ON m.user_account_id = u.id
       WHERE m.role = 'master' AND m.status = 'active' AND u.status = 'active'
         AND u.id <> $1 LIMIT 1`,
      [id],
    );
    const target = await this.database.query(
      `SELECT 1 FROM organization_memberships WHERE user_account_id = $1 AND role = 'master'`,
      [id],
    );
    if (target.rowCount && !others.rowCount) {
      throw new AccountError("At least one active administrator must remain.");
    }
  }

  // The first administrator: creates the consultancy if needed and a master account.
  // They still need an invitation link to choose a password.
  async provisionAdministrator(email: string, displayName: string) {
    const existing = await this.database.query(
      `SELECT 1 FROM user_accounts WHERE lower(email) = lower($1)`,
      [email],
    );
    if (existing.rowCount) throw new AccountError("That user already exists.");
    return this.createUser({ email, displayName, role: "master" });
  }

  private async consultancyId(): Promise<string> {
    const found = await this.database.query<{ id: string }>(
      `SELECT id FROM organizations WHERE kind = 'consultancy' AND status = 'active' LIMIT 1`,
    );
    if (found.rows[0]) return found.rows[0].id;
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO organizations (id, kind, legal_name, display_name)
       VALUES ($1, 'consultancy', $2, $2)`,
      [id, CONSULTANCY_NAME],
    );
    return id;
  }

  private async activeCarrierId(id: string): Promise<string> {
    const found = await this.database.query(
      `SELECT 1 FROM organizations
       WHERE id::text = $1 AND kind = 'carrier' AND status = 'active'`,
      [id],
    );
    if (!found.rowCount) throw new AccountError("Carrier company not found.");
    return id;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
