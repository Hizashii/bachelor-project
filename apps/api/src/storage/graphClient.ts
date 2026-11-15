import { graphError, StorageError } from "./errors.ts";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

export type GraphPage<T> = {
  value: T[];
  nextLink: string | null;
};

export type GraphVersion = {
  id: string;
  lastModifiedDateTime?: string;
  size?: number;
};

export type GraphChunkResult = {
  item?: GraphDriveItem;
  nextExpectedRanges?: string[];
};

export interface GraphGateway {
  listChildren(
    driveId: string,
    parentItemId: string,
    nextLink: string | null,
    pageSize: number,
  ): Promise<GraphPage<GraphDriveItem>>;
  getDriveItem(driveId: string, itemId: string): Promise<GraphDriveItem>;
  getItemFields(
    driveId: string,
    itemId: string,
  ): Promise<Record<string, unknown>>;
  patchItemFields(
    driveId: string,
    itemId: string,
    fields: Record<string, string | boolean>,
  ): Promise<void>;
  createFolder(
    driveId: string,
    parentItemId: string,
    name: string,
  ): Promise<GraphDriveItem>;
  createUploadSession(
    driveId: string,
    parentItemId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; expirationDateTime: string }>;
  uploadChunk(
    uploadUrl: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<GraphChunkResult>;
  downloadFile(driveId: string, itemId: string): Promise<Response>;
  listVersions(driveId: string, itemId: string): Promise<GraphVersion[]>;
  deleteItem(driveId: string, itemId: string): Promise<void>;
}

export type GraphClientOptions = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
};

export class MicrosoftGraphClient implements GraphGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly options: GraphClientOptions;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: GraphClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxRetries = options.maxRetries ?? 3;
  }

  async listChildren(
    driveId: string,
    parentItemId: string,
    nextLink: string | null,
    pageSize: number,
  ): Promise<GraphPage<GraphDriveItem>> {
    const path =
      nextLink ??
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children?$top=${pageSize}`;
    const result = await this.requestJson<{
      value: GraphDriveItem[];
      "@odata.nextLink"?: string;
    }>(path);
    return { value: result.value, nextLink: result["@odata.nextLink"] ?? null };
  }

  async getDriveItem(driveId: string, itemId: string): Promise<GraphDriveItem> {
    return this.requestJson<GraphDriveItem>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
    );
  }

  async getItemFields(
    driveId: string,
    itemId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.requestJson<{ [key: string]: unknown }>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/listItem/fields`,
    );
    return result;
  }

  async patchItemFields(
    driveId: string,
    itemId: string,
    fields: Record<string, string | boolean>,
  ): Promise<void> {
    await this.requestJson(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/listItem/fields`,
      { method: "PATCH", body: JSON.stringify(fields) },
    );
  }

  async createFolder(
    driveId: string,
    parentItemId: string,
    name: string,
  ): Promise<GraphDriveItem> {
    return this.requestJson<GraphDriveItem>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
    );
  }

  async createUploadSession(
    driveId: string,
    parentItemId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; expirationDateTime: string }> {
    return this.requestJson<{ uploadUrl: string; expirationDateTime: string }>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(fileName)}:/createUploadSession`,
      {
        method: "POST",
        body: JSON.stringify({
          item: { "@microsoft.graph.conflictBehavior": "fail", name: fileName },
        }),
      },
    );
  }

  async uploadChunk(
    uploadUrl: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<GraphChunkResult> {
    const response = await this.requestRaw(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": contentRange,
        "Content-Type": "application/octet-stream",
      },
      body: chunk as unknown as BodyInit,
      includeAuthorization: false,
    });
    if (response.status === 202) {
      return (await response.json()) as GraphChunkResult;
    }
    return { item: (await response.json()) as GraphDriveItem };
  }

  async downloadFile(driveId: string, itemId: string): Promise<Response> {
    return this.requestRaw(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
      { includeAuthorization: true },
    );
  }

  async listVersions(driveId: string, itemId: string): Promise<GraphVersion[]> {
    const result = await this.requestJson<{ value: GraphVersion[] }>(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/versions`,
    );
    return result.value;
  }

  async deleteItem(driveId: string, itemId: string): Promise<void> {
    await this.requestRaw(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE", includeAuthorization: true },
    );
  }

  // Read-only check used by npm run check:setup: can the app reach the approved folder, and
  // does the library have the columns the adapter needs?
  async probe(
    driveId: string,
    rootItemId: string,
    requiredColumns: readonly string[],
  ): Promise<{ rootFolder: string; missingColumns: string[] }> {
    const root = await this.getDriveItem(driveId, rootItemId);
    const columns = await this.requestJson<{ value: { name: string }[] }>(
      `/drives/${encodeURIComponent(driveId)}/list/columns?$select=name`,
    );
    const found = new Set(columns.value.map((column) => column.name));
    return {
      rootFolder: root.name,
      missingColumns: requiredColumns.filter((name) => !found.has(name)),
    };
  }

  private async requestJson<T>(
    pathOrUrl: string,
    options: { method?: string; body?: string } = {},
  ): Promise<T> {
    const response = await this.requestRaw(pathOrUrl, {
      method: options.method,
      body: options.body,
      includeAuthorization: true,
    });
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async requestRaw(
    pathOrUrl: string,
    options: {
      method?: string;
      body?: BodyInit;
      headers?: Record<string, string>;
      includeAuthorization: boolean;
    },
  ): Promise<Response> {
    let lastError: StorageError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const headers = new Headers(options.headers);
        if (options.includeAuthorization) {
          headers.set("Authorization", `Bearer ${await this.accessToken()}`);
        }
        if (options.body !== undefined && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        const response = await this.fetchImpl(this.toUrl(pathOrUrl), {
          method: options.method ?? "GET",
          headers,
          body: options.body,
          redirect: "follow",
        });
        if (response.ok || response.status === 202 || response.status === 204) {
          return response;
        }
        if (response.status === 401) this.token = null;
        const retryAfterSeconds = retryAfter(
          response.headers.get("Retry-After"),
        );
        const details = await safeGraphError(response);
        lastError = graphError(
          response.status,
          details.code,
          details.message,
          retryAfterSeconds,
        );
        if (
          !RETRYABLE_STATUSES.has(response.status) ||
          attempt === this.maxRetries
        ) {
          throw lastError;
        }
        await this.sleep(retryDelay(attempt, retryAfterSeconds));
      } catch (error) {
        if (error instanceof StorageError) {
          lastError = error;
          if (
            error.code === "forbidden" ||
            error.code === "not_found" ||
            error.code === "conflict"
          ) {
            throw error;
          }
          if (attempt === this.maxRetries) throw error;
          await this.sleep(retryDelay(attempt, error.retryAfterSeconds));
          continue;
        }
        lastError = new StorageError(
          "cloud_unavailable",
          "Microsoft 365 storage is temporarily unavailable.",
          { cause: error },
        );
        if (attempt === this.maxRetries) throw lastError;
        await this.sleep(retryDelay(attempt, null));
      }
    }
    throw (
      lastError ??
      new StorageError(
        "cloud_unavailable",
        "Microsoft 365 storage is unavailable.",
      )
    );
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000)
      return this.token.value;
    const response = await this.fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(this.options.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    if (!response.ok) {
      throw new StorageError(
        "cloud_unavailable",
        "Microsoft 365 authentication is unavailable.",
      );
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token || !payload.expires_in) {
      throw new StorageError(
        "cloud_unavailable",
        "Microsoft 365 returned an invalid access token.",
      );
    }
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + payload.expires_in * 1000,
    };
    return payload.access_token;
  }

  private toUrl(pathOrUrl: string): string {
    return pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${GRAPH_ROOT}${pathOrUrl}`;
  }
}

function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds, 0), 30);
  const date = Date.parse(header);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(Math.max((date - Date.now()) / 1000, 0), 30);
}

function retryDelay(
  attempt: number,
  retryAfterSeconds: number | undefined | null,
): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds !== null) {
    return Math.round(retryAfterSeconds * 1000);
  }
  return Math.min(500 * 2 ** attempt, 8_000);
}

async function safeGraphError(
  response: Response,
): Promise<{ code?: string; message: string }> {
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return {
      code: payload.error?.code,
      message: payload.error?.message ?? "Microsoft Graph request failed.",
    };
  } catch {
    return { message: "Microsoft Graph request failed." };
  }
}
