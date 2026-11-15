// Sign-in data in PostgreSQL: who a user is, their password hash, failed-attempt lockout,
// and the one-time invitation and password-reset links. Only hashes of secrets are stored.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../auth/types.ts";
import type { Database } from "./pool.ts";

export type LinkKind = "invitation" | "password_reset";

// A user as the directory knows them. Only active users may sign in or keep a session.
export type DirectoryUser = AuthenticatedUser & { active: boolean };

export type Credentials = {
  user: DirectoryUser;
  passwordHash: string | null;
  lockedUntil: Date | null;
};

type Row = {
  id: string;
  email: string;
  display_name: string | null;
  user_status: string;
  role: AuthenticatedUser["role"];
  membership_status: string;
  carrier_company_id: string | null;
  organization_status: string;
  password_hash: string | null;
  locked_until: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_BYTES = 32;

const SELECT_USER = `
  SELECT u.id, u.email, u.display_name, u.status AS user_status, u.password_hash,
         u.locked_until, m.role, m.status AS membership_status,
         m.carrier_company_id, o.status AS organization_status
  FROM user_accounts u
  JOIN organization_memberships m ON m.user_account_id = u.id
  JOIN organizations o ON o.id = m.organization_id`;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class CredentialStore {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async findById(id: string): Promise<DirectoryUser | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.database.query<Row>(
      `${SELECT_USER} WHERE u.id = $1`,
      [id],
    );
    return rows[0] ? toCredentials(rows[0]).user : null;
  }

  async findByEmail(email: string): Promise<Credentials | null> {
    const { rows } = await this.database.query<Row>(
      `${SELECT_USER} WHERE lower(u.email) = lower($1)`,
      [email.trim()],
    );
    return rows[0] ? toCredentials(rows[0]) : null;
  }

  // Counts a wrong password; the account locks for a while after too many in a row.
  async recordFailure(id: string, maxFailures: number, lockMinutes: number) {
    await this.database.query(
      `UPDATE user_accounts
         SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= $2
               THEN now() + make_interval(mins => $3) ELSE locked_until END,
             updated_at = now()
       WHERE id = $1`,
      [id, maxFailures, lockMinutes],
    );
  }

  async recordSuccess(id: string) {
    await this.database.query(
      `UPDATE user_accounts
         SET failed_logins = 0, locked_until = NULL, last_login_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  // A new password ends every session of that user and clears any lockout.
  async setPassword(id: string, passwordHash: string) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE user_accounts
           SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now()
         WHERE id = $1`,
        [id, passwordHash],
      );
      await client.query(
        "DELETE FROM user_sessions WHERE user_account_id = $1",
        [id],
      );
      await client.query(
        "UPDATE user_tokens SET used_at = now() WHERE user_account_id = $1 AND used_at IS NULL",
        [id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Returns the link's secret once; a new link replaces any unused one of the same kind.
  async issueLink(
    userId: string,
    kind: LinkKind,
    hoursValid: number,
  ): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    await this.database.query(
      `UPDATE user_tokens SET used_at = now()
       WHERE user_account_id = $1 AND kind = $2 AND used_at IS NULL`,
      [userId, kind],
    );
    await this.database.query(
      `INSERT INTO user_tokens (id, user_account_id, kind, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
      [randomUUID(), userId, kind, hashToken(token), hoursValid],
    );
    return token;
  }

  // Who a link belongs to, without using it up. Lets a weak password be refused first.
  async peekLink(token: string, kind: LinkKind): Promise<string | null> {
    const { rows } = await this.database.query<{ user_account_id: string }>(
      `SELECT user_account_id FROM user_tokens
       WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(token), kind],
    );
    return rows[0]?.user_account_id ?? null;
  }

  // A link works once and only before it expires.
  async useLink(token: string, kind: LinkKind): Promise<string | null> {
    const { rows } = await this.database.query<{ user_account_id: string }>(
      `UPDATE user_tokens SET used_at = now()
       WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING user_account_id`,
      [hashToken(token), kind],
    );
    return rows[0]?.user_account_id ?? null;
  }
}

function toCredentials(row: Row): Credentials {
  const active =
    row.user_status === "active" &&
    row.membership_status === "active" &&
    row.organization_status === "active";
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name ?? row.email,
      role: row.role,
      companyId: row.carrier_company_id,
      active,
    },
    passwordHash: row.password_hash,
    lockedUntil: row.locked_until,
  };
}
