// This file is the email contract. Real sending (Graph sendMail) is a separate implementation.
// The idempotency key makes a repeated send safe: the same key is delivered once.

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type MailResult = { status: "sent" | "duplicate" };

export interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

// Records messages in memory. Used by tests and by local development.
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  private readonly keys = new Set<string>();

  async send(message: MailMessage): Promise<MailResult> {
    if (this.keys.has(message.idempotencyKey)) return { status: "duplicate" };
    this.keys.add(message.idempotencyKey);
    this.sent.push(message);
    return { status: "sent" };
  }
}
