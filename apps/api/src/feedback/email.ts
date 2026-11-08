export type FeedbackEmailConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
  carrierEmails: Record<string, string>;
};

export class FeedbackConfigurationError extends Error {}

type EmailResponse = {
  ok: boolean;
  status: number;
};

type EmailRequest = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<EmailResponse>;

export function readFeedbackEmailConfig(
  env: Record<string, string | undefined>,
): FeedbackEmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.FEEDBACK_FROM_EMAIL?.trim();
  const carrierEmails = parseCarrierEmails(env.CARRIER_FEEDBACK_EMAILS_JSON);

  if (!apiKey || !from || !carrierEmails) {
    return null;
  }

  return {
    apiKey,
    from,
    replyTo: env.FEEDBACK_REPLY_TO?.trim() || undefined,
    carrierEmails,
  };
}

export async function sendFeedbackEmail(
  config: FeedbackEmailConfig,
  input: { carrierId: string; carrierName: string; message: string },
  request: EmailRequest = defaultEmailRequest,
): Promise<void> {
  const recipient = config.carrierEmails[input.carrierId];
  if (!recipient) {
    throw new FeedbackConfigurationError(
      "No feedback email is configured for this carrier.",
    );
  }

  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [recipient],
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      subject: "Feedback during a freight bidding round",
      text: [
        `Carrier: ${input.carrierName}`,
        "",
        "Feedback from the customer:",
        input.message,
        "",
        "Please follow up with the customer while bidding is open.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}.`);
  }
}

function parseCarrierEmails(
  value: string | undefined,
): Record<string, string> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }

    const entries = Object.entries(parsed).filter(
      ([carrierId, email]) =>
        carrierId.trim().length > 0 &&
        typeof email === "string" &&
        email.trim().length > 0,
    );
    return entries.length > 0
      ? Object.fromEntries(
          entries.map(([carrierId, email]) => [
            carrierId,
            String(email).trim(),
          ]),
        )
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultEmailRequest: EmailRequest = (url, init) => fetch(url, init);
