// This file checks the local storage contract without contacting SharePoint.

import { describe, expect, it } from "vitest";
import { InMemoryStorage } from "./in-memory.ts";

describe("InMemoryStorage", () => {
  it("keeps an etag for optimistic concurrency", async () => {
    const storage = new InMemoryStorage();
    const first = await storage.write("demo.json", "first");
    const second = await storage.write("demo.json", "second", first.etag);

    expect(second.etag).not.toBe(first.etag);
    await expect(storage.write("demo.json", "third", first.etag)).rejects.toThrow();
  });
});
