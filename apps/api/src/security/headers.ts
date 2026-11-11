// This file adds the browser safety headers to every response.
// The CSP allows no inline scripts. It is not a replacement for checks on the server.

import type { FastifyInstance } from "fastify";

const HSTS_SECONDS = 63_072_000;

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Strict-Transport-Security": `max-age=${HSTS_SECONDS}; includeSubDomains`,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export function installSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
  });
}
