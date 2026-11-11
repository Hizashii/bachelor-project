// This file limits how often one address may call sign-in and upload endpoints.
// It uses @fastify/rate-limit. Limits are per address and per minute.

import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export const AUTH_LIMIT_PER_MINUTE = 20;
export const UPLOAD_LIMIT_PER_MINUTE = 60;
const WINDOW = "1 minute";

function isUpload(contentType: string | undefined): boolean {
  return contentType?.startsWith("multipart/") ?? false;
}

export function installRateLimits(app: FastifyInstance): void {
  app.register(rateLimit, { global: false });
  let authLimit: ReturnType<FastifyInstance["rateLimit"]> | undefined;
  let uploadLimit: ReturnType<FastifyInstance["rateLimit"]> | undefined;
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/auth/")) {
      authLimit ??= app.rateLimit({
        max: AUTH_LIMIT_PER_MINUTE,
        timeWindow: WINDOW,
      });
      return authLimit.call(app, request, reply);
    }
    if (isUpload(request.headers["content-type"])) {
      uploadLimit ??= app.rateLimit({
        max: UPLOAD_LIMIT_PER_MINUTE,
        timeWindow: WINDOW,
        groupId: "upload",
      });
      return uploadLimit.call(app, request, reply);
    }
  });
}
