// This file tests GraphStore against a fake Graph (a fetch function), not the real service.

import { describe, expect, it } from "vitest";
import { AppError } from "../errors.ts";
import { GraphStore } from "./graphStore.ts";

type Reply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};
type Call = { url: string; method: string; headers: Record<string, string> };

function makeStore(replies: Reply[]) {
  const calls: Call[] = [];
  const waits: number[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = replies.shift() ?? { status: 500 };
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: next.headers,
    });
  }) as typeof fetch;
  const store = new GraphStore({
    siteId: "site1",
    tokens: { getToken: async () => "tok" },
    doFetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { store, calls, waits };
}

const BYTES = new Uint8Array([1]);

describe("GraphStore writes", () => {
  it("sends If-Match on update and maps 412", async () => {
    const { store, calls } = makeStore([
      { status: 200, body: { eTag: "e2" } },
      { status: 412 },
    ]);
    expect(await store.writeBytes("a/b.json", BYTES, "e1")).toEqual({
      etag: "e2",
    });
    expect(calls[0]?.headers["If-Match"]).toBe("e1");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok");
    await expect(
      store.writeBytes("a/b.json", BYTES, "e1"),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("creates with conflictBehavior=fail and maps 409 to CONFLICT", async () => {
    const { store, calls } = makeStore([{ status: 409 }]);
    await expect(
      store.writeBytes("a b/c.json", BYTES, null),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(calls[0]?.url).toContain("conflictBehavior=fail");
    expect(calls[0]?.url).toContain("a%20b/c.json");
    expect(calls[0]?.headers["If-Match"]).toBeUndefined();
  });
});

describe("GraphStore retries", () => {
  it("waits for Retry-After on 429 then succeeds", async () => {
    const { store, waits } = makeStore([
      { status: 429, headers: { "Retry-After": "3" } },
      { status: 200, body: { eTag: "e1" } },
    ]);
    await store.writeBytes("a.json", BYTES, null);
    expect(waits).toEqual([3000]);
  });

  it("gives up with LOCKED after bounded retries", async () => {
    const { store, calls } = makeStore(
      Array.from({ length: 10 }, () => ({ status: 423 })),
    );
    const error = await store.writeBytes("a.json", BYTES, "e").catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("LOCKED");
    expect(calls.length).toBeLessThan(10);
  });
});

describe("GraphStore reads", () => {
  it("returns null for a missing file and an empty list for a missing folder", async () => {
    const { store } = makeStore([{ status: 404 }, { status: 404 }]);
    expect(await store.readJson("x.json")).toBeNull();
    expect(await store.list("nope")).toEqual([]);
  });

  it("reads content through the download url with the item ETag", async () => {
    const { store } = makeStore([
      {
        status: 200,
        body: { eTag: "e7", "@microsoft.graph.downloadUrl": "https://dl/x" },
      },
      { status: 200, body: { hello: "world" } },
    ]);
    expect(await store.readJson("x.json")).toEqual({
      data: { hello: "world" },
      etag: "e7",
    });
  });

  it("follows list paging", async () => {
    const { store } = makeStore([
      {
        status: 200,
        body: { value: [{ name: "b" }], "@odata.nextLink": "https://next" },
      },
      { status: 200, body: { value: [{ name: "a" }] } },
    ]);
    expect(await store.list("d")).toEqual(["a", "b"]);
  });
});

describe("GraphStore appendLine", () => {
  it("retries when another writer changed the file", async () => {
    const file = { eTag: "e1", "@microsoft.graph.downloadUrl": "https://dl/x" };
    const { store, calls } = makeStore([
      { status: 200, body: file },
      { status: 200, body: {} },
      { status: 412 },
      { status: 200, body: file },
      { status: 200, body: {} },
      { status: 200, body: { eTag: "e2" } },
    ]);
    await store.appendLine("audit/2027-01-01.jsonl", "{}");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });
});
