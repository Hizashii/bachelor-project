import { describe, expect, it } from "vitest";
import { MicrosoftGraphClient } from "./graphClient.ts";

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

  const tokenResponse = () =>
    new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }));

  function clientAnswering(...answers: Response[]) {
    const queue = [tokenResponse(), ...answers];
    return new MicrosoftGraphClient({
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: async () =>
        queue.shift() ?? new Response(null, { status: 500 }),
      sleep: async () => {},
      maxRetries: 0,
    });
  }

  it("reports which library columns are missing", async () => {
    const client = clientAnswering(
      new Response(
        JSON.stringify({ id: "root", name: "Freight Desk", folder: {} }),
      ),
      new Response(
        JSON.stringify({ value: [{ name: "FreightOrganisationId" }] }),
      ),
    );
    const probe = await client.probe("drive", "root", [
      "FreightOrganisationId",
      "FreightOwnerId",
    ]);
    expect(probe).toEqual({
      rootFolder: "Freight Desk",
      missingColumns: ["FreightOwnerId"],
    });
  });

  it("reports missing SharePoint permissions as forbidden, not as a crash", async () => {
    const client = clientAnswering(
      new Response(
        JSON.stringify({ error: { code: "accessDenied", message: "no" } }),
        {
          status: 403,
        },
      ),
    );
    await expect(client.getDriveItem("drive", "root")).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });
  });

  it("reports a rejected app secret as storage being unavailable", async () => {
    const client = new MicrosoftGraphClient({
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "wrong",
      fetchImpl: async () => new Response("{}", { status: 401 }),
      sleep: async () => {},
      maxRetries: 0,
    });
    await expect(client.getDriveItem("drive", "root")).rejects.toMatchObject({
      code: "cloud_unavailable",
    });
  });
});
