// Sign-in with e-mail and password: checking credentials, locking an account after repeated
// wrong passwords, sessions, and the invitation and password-reset links.
// Not for HTTP: see routes.ts.

import type { ApiEnvironment } from "../config/env.ts";
import type { CredentialStore, LinkKind } from "../db/credentials.ts";
import {
  hashPassword,
  passwordProblem,
  spendCheckTime,
  verifyPassword,
} from "./password.ts";
import { SESSION_COOKIE, type SessionStore } from "./sessions.ts";
import type { AuthenticatedUser, RequestAuth } from "./types.ts";

export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const INVITATION_HOURS = 24 * 7;
export const RESET_HOURS = 2;

const invalidLogin = () =>
  new AuthError(
    "invalid_credentials",
    "The e-mail or password is not correct.",
    401,
  );

const invalidLink = () =>
  new AuthError("invalid_link", "This link is not valid any more.", 400);

export type AuthServiceDependencies = {
  environment: ApiEnvironment;
  credentials: CredentialStore;
  sessions: SessionStore;
};

export class AuthService {
  public readonly sessionCookieName = SESSION_COOKIE;

  private readonly dependencies: AuthServiceDependencies;

  public constructor(dependencies: AuthServiceDependencies) {
    this.dependencies = dependencies;
  }

  // A wrong e-mail, a wrong password and a locked account all look the same from outside.
  public async login(email: string, password: string) {
    const { credentials, sessions, environment } = this.dependencies;
    const found = await credentials.findByEmail(email);
    const locked =
      found?.lockedUntil && found.lockedUntil.getTime() > Date.now();
    if (!found?.passwordHash || locked) {
      await spendCheckTime(password);
      throw invalidLogin();
    }
    if (!(await verifyPassword(found.passwordHash, password))) {
      await credentials.recordFailure(
        found.user.id,
        MAX_FAILED_LOGINS,
        LOCK_MINUTES,
      );
      throw invalidLogin();
    }
    if (!found.user.active) {
      throw new AuthError("account_disabled", "This account is disabled.", 403);
    }
    await credentials.recordSuccess(found.user.id);
    const session = await sessions.create(
      found.user.id,
      environment.SESSION_TTL_SECONDS,
    );
    return { ...session, user: toPublicUser(found.user) };
  }

  public async authenticate(
    cookieValue: string | undefined,
  ): Promise<RequestAuth | null> {
    if (!cookieValue) return null;
    const { sessions, credentials } = this.dependencies;
    const session = await sessions.get(cookieValue);
    if (!session) return null;
    const user = await credentials.findById(session.userId);
    if (!user?.active) {
      await sessions.delete(cookieValue);
      return null;
    }
    return { session, user: toPublicUser(user) };
  }

  public async revokeSession(cookieValue: string | undefined): Promise<void> {
    if (cookieValue) await this.dependencies.sessions.delete(cookieValue);
  }

  // Sets the first password (invitation) or a new one (reset) from a one-time link.
  // A weak password is refused before the link is used up, so the person can try again.
  public async setPasswordFromLink(
    token: string,
    kind: LinkKind,
    password: string,
  ) {
    const { credentials } = this.dependencies;
    const peeked = await credentials.peekLink(token, kind);
    const user = peeked ? await credentials.findById(peeked) : null;
    if (!user?.active) throw invalidLink();
    this.assertGoodPassword(password, user.email);
    const userId = await credentials.useLink(token, kind);
    if (userId !== user.id) throw invalidLink();
    await credentials.setPassword(user.id, await hashPassword(password));
  }

  public async changePassword(userId: string, current: string, next: string) {
    const { credentials } = this.dependencies;
    const user = await credentials.findById(userId);
    const found = user ? await credentials.findByEmail(user.email) : null;
    if (
      !user ||
      !found?.passwordHash ||
      !(await verifyPassword(found.passwordHash, current))
    ) {
      throw new AuthError(
        "invalid_credentials",
        "The current password is not correct.",
        403,
      );
    }
    this.assertGoodPassword(next, user.email);
    await credentials.setPassword(user.id, await hashPassword(next));
  }

  private assertGoodPassword(password: string, email: string): void {
    const problem = passwordProblem(password, email);
    if (problem) throw new AuthError("weak_password", problem, 400);
  }
}

function toPublicUser(
  user: AuthenticatedUser & { active: boolean },
): AuthenticatedUser {
  const { active: _active, ...rest } = user;
  return rest;
}
