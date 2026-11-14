import { describe, expect, it } from "vitest";
import { MicrosoftGraphClient } from "./graphClient.js";

describe("MicrosoftGraphClient", () => {
  it("retries Graph throttling with a bounded Retry-After delay", async () => {
    const responses = [
      new Response(
        JSON.stringify({ access_token: "token", expires_in: 3600 }),
        {
          status: 200,
        },
      ),
      new Response(JSON.stringify({ error: { code: "tooManyRequests" } }), {
        status: 429,
        headers: { "Retry-After": "0" },
      }),
      new Response(
        JSON.stringify({ id: "file-1", name: "shipment.csv", file: {} }),
        {
          status: 200,
        },
      ),
    ];
    const delays: number[] = [];
    const client = new MicrosoftGraphClient({
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: async () =>
        responses.shift() ?? new Response(null, { status: 500 }),
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      maxRetries: 2,
    });

    const item = await client.getDriveItem("drive", "file-1");
    expect(item.id).toBe("file-1");
    expect(delays).toEqual([0]);
  });
});
