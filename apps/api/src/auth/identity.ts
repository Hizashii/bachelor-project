import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { ApiEnvironment } from "../config/env.ts";
import type { AuthTransaction } from "./sessions.ts";
import type { ExternalIdentity } from "./types.ts";

export interface IdentityProvider {
  createAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): Promise<string>;
  exchangeCode(
    code: string,
    transaction: AuthTransaction,
  ): Promise<ExternalIdentity>;
  createLogoutUrl(): string;
}

type OpenIdConfiguration = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

type TokenResponse = {
  id_token?: string;
  access_token?: string;
};

function hasMfaClaim(payload: JWTPayload): boolean {
  const amr = payload.amr;
  if (Array.isArray(amr) && amr.some((method) => method === "mfa")) return true;

  const acr = payload.acr;
  return typeof acr === "string" && acr.toLowerCase().includes("mfa");
}

function claimAsString(payload: JWTPayload, name: string): string | null {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function base64UrlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function requiredSetting(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for Entra authentication.`);
  return value;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: base64UrlSha256(verifier) };
}

export class EntraIdentityProvider implements IdentityProvider {
  private configurationPromise: Promise<OpenIdConfiguration> | undefined;

  public constructor(private readonly environment: ApiEnvironment) {}

  public async createAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): Promise<string> {
    const configuration = await this.getConfiguration();
    const url = new URL(configuration.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: requiredSetting(
        this.environment.ENTRA_CLIENT_ID,
        "ENTRA_CLIENT_ID",
      ),
      response_type: "code",
      redirect_uri: this.environment.ENTRA_REDIRECT_URI,
      response_mode: "query",
      scope: this.environment.ENTRA_SCOPES,
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  public async exchangeCode(
    code: string,
    transaction: AuthTransaction,
  ): Promise<ExternalIdentity> {
    const configuration = await this.getConfiguration();
    const response = await fetch(configuration.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requiredSetting(
          this.environment.ENTRA_CLIENT_ID,
          "ENTRA_CLIENT_ID",
        ),
        client_secret: requiredSetting(
          this.environment.ENTRA_CLIENT_SECRET,
          "ENTRA_CLIENT_SECRET",
        ),
        grant_type: "authorization_code",
        code,
        redirect_uri: this.environment.ENTRA_REDIRECT_URI,
        code_verifier: transaction.codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Entra token exchange failed with status ${response.status}.`,
      );
    }

    const tokenResponse = (await response.json()) as TokenResponse;
    if (!tokenResponse.id_token)
      throw new Error("Entra did not return an ID token.");

    const remoteJwks = createRemoteJWKSet(new URL(configuration.jwks_uri));
    const verified = await jwtVerify(tokenResponse.id_token, remoteJwks, {
      issuer: configuration.issuer,
      audience: requiredSetting(
        this.environment.ENTRA_CLIENT_ID,
        "ENTRA_CLIENT_ID",
      ),
    });
    const nonce = claimAsString(verified.payload, "nonce");
    if (!nonce || !constantTimeStringEqual(nonce, transaction.nonce)) {
      throw new Error("Entra ID token nonce validation failed.");
    }

    const tenantId = claimAsString(verified.payload, "tid");
    const subject =
      claimAsString(verified.payload, "oid") ??
      claimAsString(verified.payload, "sub");
    const email =
      claimAsString(verified.payload, "preferred_username") ??
      claimAsString(verified.payload, "email");
    const displayName = claimAsString(verified.payload, "name") ?? email;

    if (
      !tenantId ||
      tenantId !== this.environment.ENTRA_TENANT_ID ||
      !subject ||
      !email ||
      !displayName
    ) {
      throw new Error(
        "Entra identity is missing a trusted tenant or profile claim.",
      );
    }

    return {
      subject,
      tenantId,
      email,
      displayName,
      mfaVerified: hasMfaClaim(verified.payload),
    };
  }

  public createLogoutUrl(): string {
    const url = new URL(
      `https://login.microsoftonline.com/${this.environment.ENTRA_TENANT_ID}/oauth2/v2.0/logout`,
    );
    url.searchParams.set(
      "post_logout_redirect_uri",
      this.environment.ENTRA_POST_LOGOUT_REDIRECT_URI,
    );
    return url.toString();
  }

  private async getConfiguration(): Promise<OpenIdConfiguration> {
    if (!this.configurationPromise) {
      this.configurationPromise = (async () => {
        const discoveryUrl =
          `https://login.microsoftonline.com/${this.environment.ENTRA_TENANT_ID}` +
          "/v2.0/.well-known/openid-configuration";
        const response = await fetch(discoveryUrl);
        if (!response.ok)
          throw new Error(
            `Entra discovery failed with status ${response.status}.`,
          );
        const value = (await response.json()) as Partial<OpenIdConfiguration>;
        if (
          !value.authorization_endpoint ||
          !value.token_endpoint ||
          !value.jwks_uri ||
          !value.issuer
        ) {
          throw new Error("Entra discovery document is incomplete.");
        }
        return value as OpenIdConfiguration;
      })();
    }
    return this.configurationPromise;
  }
}
