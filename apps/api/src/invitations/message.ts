// This file builds the invitation email. It carries a login-protected link and nothing else:
// no prices, no tender details, no company data.

import type { MailMessage } from "../mail.ts";

const DEFAULT_APP_URL = "http://localhost:5173";

export const appBaseUrl = (): string =>
  (process.env.APP_BASE_URL ?? DEFAULT_APP_URL).replace(/\/+$/, "");

// The same tender, invitation and kind always give the same key, so a retry never double-sends.
export const idempotencyKey = (
  tenderId: string,
  invitationId: string,
  kind: string,
): string => `${tenderId}:${invitationId}:${kind}`;

export function buildInvitationMail(input: {
  tenderId: string;
  to: string;
  key: string;
  baseUrl: string;
}): MailMessage {
  const link = `${input.baseUrl}/carrier/tenders/${input.tenderId}`;
  return {
    to: input.to,
    subject: "You are invited to a freight tender",
    text: `You have been invited to submit an offer on Freight Desk.\nSign in to see the details: ${link}\n`,
    idempotencyKey: input.key,
  };
}
