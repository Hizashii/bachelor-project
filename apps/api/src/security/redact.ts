// This file keeps secrets and prices out of logs. Logs hold method, path and ids, nothing else.
// Use redactValue before logging any object. It is not a way to make logging a body safe: do not log bodies.

import type { FastifyServerOptions } from "fastify";

const SECRET_KEY =
  /price|amount|rate|total|token|secret|password|authorization|cookie|code|state|nonce|body|key/i;
export const REDACTED = "[redacted]";

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redactValue(inner);
  }
  return out;
}

export function pathOnly(url: string): string {
  return url.split("?")[0] ?? "";
}

export function loggerOptions(level: string): FastifyServerOptions["logger"] {
  return {
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
      censor: REDACTED,
    },
    serializers: {
      req: (req: { method?: string; url?: string; id?: string }) => ({
        id: req.id,
        method: req.method,
        url: pathOnly(req.url ?? ""),
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      err: (err: Error) => ({ type: err.name, message: REDACTED, stack: "" }),
    },
  };
}
