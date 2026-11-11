import type { ApiEnvironment } from "../config/env.ts";
import { toAuthenticatedUser, type UserDirectory } from "./directory.ts";
import type { IdentityProvider } from "./identity.ts";
import { SESSION_COOKIE, type SessionStore } from "./sessions.ts";
import type { ExternalIdentity, RequestAuth } from "./types.ts";

export class AuthError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthServiceDependencies = {
  environment: ApiEnvironment;
  directory: UserDirectory;
  sessions: SessionStore;
  identityProvider?: IdentityProvider;
};

export class AuthService {
  public readonly sessionCookieName = SESSION_COOKIE;

  public constructor(private readonly dependencies: AuthServiceDependencies) {}

  public async createSession(identity: ExternalIdentity) {
    if (
      this.dependencies.environment.AUTH_MODE === "entra" &&
      !identity.mfaVerified
    ) {
      throw new AuthError(
        "mfa_required",
        "Microsoft Entra MFA is required for Freight Desk.",
        403,
      );
    }

    const directoryUser =
      await this.dependencies.directory.findByExternalIdentity(identity);
    if (!directoryUser?.active) {
      throw new AuthError(
        "account_not_provisioned",
        "The account is not provisioned for Freight Desk.",
        403,
      );
    }

    const session = await this.dependencies.sessions.create(
      directoryUser.id,
      this.dependencies.environment.SESSION_TTL_SECONDS,
    );
    return {
      ...session,
      user: toAuthenticatedUser(directoryUser, identity.mfaVerified),
    };
  }

  public async authenticate(
    cookieValue: string | undefined,
  ): Promise<RequestAuth | null> {
    if (!cookieValue) return null;
    const session = await this.dependencies.sessions.get(cookieValue);
    if (!session) return null;

    const directoryUser = await this.dependencies.directory.findById(
      session.userId,
    );
    if (!directoryUser?.active) {
      await this.dependencies.sessions.delete(cookieValue);
      return null;
    }

    return {
      session,
      user: toAuthenticatedUser(directoryUser, true),
    };
  }

  public async revokeSession(cookieValue: string | undefined): Promise<void> {
    if (cookieValue) await this.dependencies.sessions.delete(cookieValue);
  }

  public get identityProvider(): IdentityProvider | undefined {
    return this.dependencies.identityProvider;
  }
}
