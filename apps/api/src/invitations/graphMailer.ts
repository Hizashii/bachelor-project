// This file sends email through Microsoft Graph sendMail from a shared mailbox.
// Token provider and fetch are injected. Unverified against the live service.
// Graph has no idempotency key, so repeats are stopped here for this process; the
// delivery record in the data library is the durable guard.

import { AppError } from "../errors.ts";
import type { Mailer, MailMessage, MailResult } from "../mail.ts";

const GRAPH_URL = "https://graph.microsoft.com/v1.0";

export type GraphMailerOptions = {
  mailbox: string;
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
};

export class GraphMailer implements Mailer {
  private readonly options: GraphMailerOptions;
  private readonly seen = new Set<string>();

  constructor(options: GraphMailerOptions) {
    this.options = options;
  }

  async send(message: MailMessage): Promise<MailResult> {
    if (this.seen.has(message.idempotencyKey)) return { status: "duplicate" };
    const doFetch = this.options.fetchFn ?? fetch;
    const mailbox = encodeURIComponent(this.options.mailbox);
    const response = await doFetch(`${GRAPH_URL}/users/${mailbox}/sendMail`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.options.getToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "Text", content: message.text },
          toRecipients: [{ emailAddress: { address: message.to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (!response.ok) {
      throw new AppError("UNAVAILABLE", "The email could not be sent.");
    }
    this.seen.add(message.idempotencyKey);
    return { status: "sent" };
  }
}
