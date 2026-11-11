import { describe, expect, it } from "vitest";
import { GraphMailer } from "./graphMailer.ts";

const message = {
  to: "a@example.com",
  subject: "s",
  text: "t",
  idempotencyKey: "k1",
};

function setup(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const mailer = new GraphMailer({
    mailbox: "desk@example.com",
    getToken: async () => "tok",
    fetchFn,
  });
  return { calls, mailer };
}

describe("GraphMailer", () => {
  it("posts to the shared mailbox with a bearer token", async () => {
    const { calls, mailer } = setup(202);
    await expect(mailer.send(message)).resolves.toEqual({ status: "sent" });
    expect(calls[0]?.url).toContain("/users/desk%40example.com/sendMail");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("does not send the same key twice", async () => {
    const { calls, mailer } = setup(202);
    await mailer.send(message);
    await expect(mailer.send(message)).resolves.toEqual({
      status: "duplicate",
    });
    expect(calls).toHaveLength(1);
  });

  it("throws when Graph refuses, and allows a retry", async () => {
    const { mailer } = setup(500);
    await expect(mailer.send(message)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    await expect(mailer.send(message)).rejects.toBeTruthy();
  });
});
