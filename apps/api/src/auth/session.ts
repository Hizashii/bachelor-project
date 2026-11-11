// This file turns a signed-in person into a signed cookie value and back.
// The cookie is HMAC-signed, so a browser cannot change its role or company.
// It is not the Microsoft sign-in itself; that fills the principal and calls issueSession.

import { createHmac, timingSafeEqual } from "node:crypto";
import { type Principal, principalSchema } from "@freight-desk/shared";
import { z } from "zod";

export const SESSION_COOKIE = "fd_session";
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_MAX_HOURS = 8;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

const payloadSchema = z.object({
  principal: principalSchema,
  startedAt: z.number(),
  lastSeenAt: z.number(),
});
type Payload = z.infer<typeof payloadSchema>;

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function encode(payload: Payload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function issueSession(
  principal: Principal,
  secret: string,
  now: Date,
): string {
  const time = now.getTime();
  return encode({ principal, startedAt: time, lastSeenAt: time }, secret);
}

export type ReadSession = { principal: Principal; renewed: string };

export function readSession(
  cookie: string | undefined,
  secret: string,
  now: Date,
): ReadSession | null {
  const payload = decode(cookie, secret);
  if (!payload) return null;
  const time = now.getTime();
  const idle = time - payload.lastSeenAt > SESSION_IDLE_MINUTES * MS_PER_MINUTE;
  const old = time - payload.startedAt > SESSION_MAX_HOURS * MS_PER_HOUR;
  if (idle || old) return null;
  const renewed = encode({ ...payload, lastSeenAt: time }, secret);
  return { principal: payload.principal, renewed };
}

function decode(cookie: string | undefined, secret: string): Payload | null {
  const [body, signature] = (cookie ?? "").split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString());
    return payloadSchema.parse(json);
  } catch {
    return null;
  }
}
