// Server-side sessions in PostgreSQL. The cookie holds a random value; the database holds
// only its hash, so a leaked table cannot be used to sign in.

import { randomBytes } from "node:crypto";
import { hashToken } from "../db/credentials.ts";
import type { Database } from "../db/pool.ts";
import type { SessionRecord } from "./types.ts";

export const SESSION_COOKIE = "freight_desk_session";

const SECRET_BYTES = 32;

export type CreatedSession = { cookieValue: string; record: SessionRecord };

export class SessionStore {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async create(userId: string, ttlSeconds: number): Promise<CreatedSession> {
    const cookieValue = randomBytes(SECRET_BYTES).toString("base64url");
    const csrfToken = randomBytes(SECRET_BYTES).toString("base64url");
    const { rows } = await this.database.query<Row>(
      `INSERT INTO user_sessions (token_hash, user_account_id, csrf_token, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))
       RETURNING created_at, expires_at`,
      [hashToken(cookieValue), userId, csrfToken, ttlSeconds],
    );
    return {
      cookieValue,
      record: toRecord(userId, csrfToken, rows[0] as Row),
    };
  }

  async get(cookieValue: string): Promise<SessionRecord | null> {
    const { rows } = await this.database.query<Row & UserRow>(
      `SELECT user_account_id, csrf_token, created_at, expires_at
       FROM user_sessions WHERE token_hash = $1`,
      [hashToken(cookieValue)],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.expires_at.getTime() <= Date.now()) {
      await this.delete(cookieValue);
      return null;
    }
    return toRecord(row.user_account_id, row.csrf_token, row);
  }

  async delete(cookieValue: string): Promise<void> {
    await this.database.query(
      "DELETE FROM user_sessions WHERE token_hash = $1",
      [hashToken(cookieValue)],
    );
  }
}

type Row = { created_at: Date; expires_at: Date };
type UserRow = { user_account_id: string; csrf_token: string };

function toRecord(userId: string, csrfToken: string, row: Row): SessionRecord {
  return {
    userId,
    csrfToken,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
  };
}
