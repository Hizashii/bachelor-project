import { describe, expect, it } from "vitest";
import { readFeedbackEmailConfig, sendFeedbackEmail } from "./email.ts";

describe("feedback email configuration", () => {
  it("requires the provider, sender, and at least one carrier address", () => {
    expect(readFeedbackEmailConfig({})).toBeNull();
    expect(
      readFeedbackEmailConfig({
        RESEND_API_KEY: "key",
        FEEDBACK_FROM_EMAIL: "desk@example.com",
        CARRIER_FEEDBACK_EMAILS_JSON: '{"carrier-a":"a@example.com"}',
      }),
    ).toMatchObject({
      apiKey: "key",
      from: "desk@example.com",
      carrierEmails: { "carrier-a": "a@example.com" },
    });
  });
});

describe("feedback email sending", () => {
  it("sends feedback to the configured carrier address", async () => {
    const calls: Array<{ url: string; body: string }> = [];

    await sendFeedbackEmail(
      {
        apiKey: "key",
        from: "desk@example.com",
        carrierEmails: { "carrier-a": "a@example.com" },
      },
      {
        carrierId: "carrier-a",
        carrierName: "Carrier A",
        message: "Please confirm Tuesday delivery.",
      },
      async (url, init) => {
        calls.push({ url, body: init.body });
        return { ok: true, status: 200 };
      },
    );

    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(calls[0].body)).toMatchObject({
      to: ["a@example.com"],
      subject: "Feedback during a freight bidding round",
    });
  });
});
