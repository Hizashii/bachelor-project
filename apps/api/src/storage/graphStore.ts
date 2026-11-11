// This file is the FileStore for the SharePoint data library, using Microsoft Graph and plain fetch.
// Rules: ETag with If-Match on updates, conflictBehavior=fail for create-only, 412 -> PRECONDITION_FAILED,
// 423 -> LOCKED after a few retries, 429 waits for Retry-After. Tokens come from an injected provider.
// Unverified live: tested against a fake fetch only. Needs a Sites.Selected grant on the data site.

import { AppError } from "../errors.ts";
import type { FetchLike, TokenProvider } from "./graphAuth.ts";
import type { FileStore, Versioned } from "./types.ts";

export type GraphStoreOptions = {
  siteId: string;
  tokens: TokenProvider;
  doFetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
};

type DriveItem = {
  eTag?: string;
  name?: string;
  "@microsoft.graph.downloadUrl"?: string;
};
type Children = { value: DriveItem[]; "@odata.nextLink"?: string };

const MAX_RETRIES = 4;
const MAX_APPEND_TRIES = 6;
const LOCK_WAIT_MS = 500;
const MAX_WAIT_MS = 30_000;
const MS_PER_SECOND = 1000;
const NOT_FOUND = 404;
const CONFLICT = 409;
const PRECONDITION = 412;
const LOCKED = 423;
const TOO_MANY = 429;

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

export class GraphStore implements FileStore {
  private readonly doFetch: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly root: string;

  constructor(private readonly options: GraphStoreOptions) {
    this.doFetch = options.doFetch ?? fetch;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
    const base = options.baseUrl ?? "https://graph.microsoft.com/v1.0";
    this.root = `${base}/sites/${encodeURIComponent(options.siteId)}/drive`;
  }

  async readJson(path: string): Promise<Versioned<unknown> | null> {
    const file = await this.readBytes(path);
    if (!file) return null;
    const text = new TextDecoder().decode(file.data);
    return { data: JSON.parse(text), etag: file.etag };
  }

  async writeJson(path: string, data: unknown, ifMatch: string | null) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return this.writeBytes(path, bytes, ifMatch);
  }

  async readBytes(path: string): Promise<Versioned<Uint8Array> | null> {
    const meta = await this.send(this.item(path), {});
    if (meta.status === NOT_FOUND) return null;
    const item = (await meta.json()) as DriveItem;
    const url = item["@microsoft.graph.downloadUrl"];
    if (!url || !item.eTag) throw new AppError("UNAVAILABLE", "Read failed.");
    const content = await this.doFetch(url);
    if (!content.ok) throw new AppError("UNAVAILABLE", "Read failed.");
    const data = new Uint8Array(await content.arrayBuffer());
    return { data, etag: item.eTag };
  }

  async writeBytes(path: string, bytes: Uint8Array, ifMatch: string | null) {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (ifMatch !== null) headers["If-Match"] = ifMatch;
    const query =
      ifMatch === null ? "?@microsoft.graph.conflictBehavior=fail" : "";
    const response = await this.send(`${this.item(path)}:/content${query}`, {
      method: "PUT",
      headers,
      body: new Uint8Array(bytes),
    });
    const item = (await response.json()) as DriveItem;
    if (!item.eTag) throw new AppError("UNAVAILABLE", "Write failed.");
    return { etag: item.eTag };
  }

  async list(directory: string): Promise<string[]> {
    const names: string[] = [];
    let url: string | undefined =
      `${this.item(directory)}:/children?$select=name`;
    while (url) {
      const response = await this.send(url, {});
      if (response.status === NOT_FOUND) return [];
      const page = (await response.json()) as Children;
      for (const entry of page.value) if (entry.name) names.push(entry.name);
      url = page["@odata.nextLink"];
    }
    return names.sort();
  }

  async appendLine(path: string, line: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_APPEND_TRIES; attempt += 1) {
      const existing = await this.readBytes(path);
      const old = existing ? new TextDecoder().decode(existing.data) : "";
      const bytes = new TextEncoder().encode(`${old}${line}\n`);
      try {
        await this.writeBytes(path, bytes, existing ? existing.etag : null);
        return;
      } catch (error) {
        const code = error instanceof AppError ? error.code : null;
        if (code !== "PRECONDITION_FAILED" && code !== "CONFLICT") throw error;
      }
    }
    throw new AppError("CONFLICT", "The log is busy. Try again.");
  }

  async move(from: string, to: string): Promise<void> {
    const slash = to.lastIndexOf("/");
    const parent = slash === -1 ? "" : to.slice(0, slash);
    const response = await this.send(this.item(from), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: to.slice(slash + 1),
        parentReference: { path: `/drive/root:/${parent}` },
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    if (response.status === NOT_FOUND) {
      throw new AppError("NOT_FOUND", "That file was not found.");
    }
  }

  private item(path: string): string {
    if (path === "") return `${this.root}/root`;
    return `${this.root}/root:/${encodePath(path)}`;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.options.tokens.getToken();
      const headers = { ...init.headers, Authorization: `Bearer ${token}` };
      const response = await this.doFetch(url, { ...init, headers });
      const wait = this.waitFor(response);
      if (wait === null || attempt >= MAX_RETRIES) return this.check(response);
      await this.sleep(wait);
    }
  }

  private waitFor(response: Response): number | null {
    if (response.status === LOCKED) return LOCK_WAIT_MS;
    if (response.status !== TOO_MANY) return null;
    const seconds = Number(response.headers.get("Retry-After"));
    const ms = seconds > 0 ? seconds * MS_PER_SECOND : LOCK_WAIT_MS;
    return Math.min(ms, MAX_WAIT_MS);
  }

  private check(response: Response): Response {
    if (response.ok || response.status === NOT_FOUND) return response;
    if (response.status === PRECONDITION) {
      throw new AppError("PRECONDITION_FAILED", "The file changed. Reload it.");
    }
    if (response.status === CONFLICT) {
      throw new AppError("CONFLICT", "That file already exists.");
    }
    if (response.status === LOCKED) {
      throw new AppError("LOCKED", "The file is being edited. Try again soon.");
    }
    if (response.status === TOO_MANY) {
      throw new AppError("RATE_LIMITED", "Too many requests. Try again soon.");
    }
    throw new AppError("UNAVAILABLE", "The file library is not available.");
  }
}
