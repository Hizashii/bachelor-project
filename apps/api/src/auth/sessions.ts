import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SessionRecord } from "./types.ts";

export const SESSION_COOKIE = "freight_desk_session";
export const AUTH_STATE_COOKIE = "freight_desk_auth_state";

export type CreatedSession = {
  cookieValue: string;
  record: SessionRecord;
};

export interface SessionStore {
  create(userId: string, ttlSeconds: number): Promise<CreatedSession>;
  get(cookieValue: string): Promise<SessionRecord | null>;
  delete(cookieValue: string): Promise<void>;
}

export type Clock = () => number;

function hashCookieValue(cookieValue: string, secret: string): string {
  return createHmac("sha256", secret).update(cookieValue).digest("hex");
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  public constructor(
    private readonly secret: string,
    private readonly now: Clock = () => Date.now(),
  ) {}

  public async create(
    userId: string,
    ttlSeconds: number,
  ): Promise<CreatedSession> {
    const cookieValue = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const record: SessionRecord = {
      userId,
      createdAt,
      expiresAt: createdAt + ttlSeconds * 1_000,
      csrfToken: randomBytes(32).toString("base64url"),
    };
    this.sessions.set(hashCookieValue(cookieValue, this.secret), record);
    return { cookieValue, record };
  }

  public async get(cookieValue: string): Promise<SessionRecord | null> {
    const key = hashCookieValue(cookieValue, this.secret);
    const record = this.sessions.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.now()) {
      this.sessions.delete(key);
      return null;
    }
    return record;
  }

  public async delete(cookieValue: string): Promise<void> {
    this.sessions.delete(hashCookieValue(cookieValue, this.secret));
  }
}

export type AuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

export interface AuthTransactionStore {
  create(
    transaction: Omit<AuthTransaction, "expiresAt">,
    ttlSeconds: number,
  ): Promise<void>;
  consume(state: string): Promise<AuthTransaction | null>;
}

export class InMemoryAuthTransactionStore implements AuthTransactionStore {
  private readonly transactions = new Map<string, AuthTransaction>();

  public constructor(private readonly now: Clock = () => Date.now()) {}

  public async create(
    transaction: Omit<AuthTransaction, "expiresAt">,
    ttlSeconds: number,
  ): Promise<void> {
    this.transactions.set(
      createHash("sha256").update(transaction.state).digest("hex"),
      {
        ...transaction,
        expiresAt: this.now() + ttlSeconds * 1_000,
      },
    );
  }

  public async consume(state: string): Promise<AuthTransaction | null> {
    const key = createHash("sha256").update(state).digest("hex");
    const transaction = this.transactions.get(key);
    this.transactions.delete(key);
    if (!transaction || transaction.expiresAt <= this.now()) return null;
    return transaction;
  }
}
