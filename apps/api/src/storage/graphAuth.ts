// This file gets Microsoft Graph access tokens for the server. It never reads environment variables:
// the caller passes the values in. Tokens stay in memory and are never logged.
// Unverified live: needs a real tenant.

import type { Clock } from "../clock.ts";

export interface TokenProvider {
  getToken(): Promise<string>;
}

export type FetchLike = typeof fetch;
type Fresh = { token: string; expiresAtMs: number };

const REFRESH_MARGIN_MS = 120_000;
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const MS_PER_SECOND = 1000;

// Reuses a token until shortly before it expires.
export class CachedTokenProvider implements TokenProvider {
  private current: Fresh | null = null;

  constructor(
    private readonly fetchFresh: () => Promise<Fresh>,
    private readonly clock: Clock,
  ) {}

  async getToken(): Promise<string> {
    const now = this.clock.now().getTime();
    if (!this.current || this.current.expiresAtMs - REFRESH_MARGIN_MS <= now) {
      this.current = await this.fetchFresh();
    }
    return this.current.token;
  }
}

type TokenReply = { access_token?: string; expires_in?: number | string };

async function readReply(response: Response, clock: Clock): Promise<Fresh> {
  if (!response.ok) throw new Error("Token request failed.");
  const body = (await response.json()) as TokenReply;
  if (!body.access_token) throw new Error("Token reply had no token.");
  const seconds = Number(body.expires_in ?? 0);
  return {
    token: body.access_token,
    expiresAtMs: clock.now().getTime() + seconds * MS_PER_SECOND,
  };
}

// Container Apps managed identity. The endpoint and header come from the platform.
export function managedIdentityProvider(
  endpoint: string,
  identityHeader: string,
  clock: Clock,
  doFetch: FetchLike = fetch,
): TokenProvider {
  const url = `${endpoint}?api-version=2019-08-01&resource=https://graph.microsoft.com`;
  const headers = { "X-IDENTITY-HEADER": identityHeader };
  return new CachedTokenProvider(
    async () => readReply(await doFetch(url, { headers }), clock),
    clock,
  );
}

// Client credentials with a secret from Key Vault. Used when no managed identity is available.
export function clientSecretProvider(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  clock: Clock,
  doFetch: FetchLike = fetch,
): TokenProvider {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
  });
  return new CachedTokenProvider(
    async () => readReply(await doFetch(url, { method: "POST", body }), clock),
    clock,
  );
}
