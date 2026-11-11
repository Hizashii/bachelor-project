// This file refuses state-changing requests that a browser sent from another website (CSRF).
// A request with no Origin header is not from a browser page, so only the cookie rules apply to it.
// The session cookie is also SameSite=Strict; this check is the second layer.

import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.ts";

const CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isOriginAllowed(
  origin: string,
  host: string | undefined,
  allowed: readonly string[],
): boolean {
  if (allowed.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function installOriginCheck(
  app: FastifyInstance,
  allowedOrigins: readonly string[],
): void {
  app.addHook("onRequest", async (request) => {
    if (!CHANGING_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    const crossSite = request.headers["sec-fetch-site"] === "cross-site";
    const bad = origin
      ? !isOriginAllowed(origin, request.headers.host, allowedOrigins)
      : crossSite;
    if (bad) throw new AppError("FORBIDDEN", "That request was not allowed.");
  });
}
