// This file turns every thrown error into the shared error body. Unknown errors become a
// generic message so no internal detail or confidential value reaches the browser.

import type { ApiError, ApiErrorCode } from "@freight-desk/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.ts";

const TOO_MANY_REQUESTS = 429;
const TOO_LARGE = 413;

function body(
  code: ApiErrorCode,
  message: string,
  details?: AppError["details"],
) {
  const error: ApiError["error"] = { code, message };
  if (details) error.details = details;
  return { error };
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(body(error.code, error.message, error.details));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === TOO_MANY_REQUESTS) {
      return reply
        .code(status)
        .send(body("RATE_LIMITED", "Too many requests."));
    }
    if (status === TOO_LARGE) {
      return reply
        .code(status)
        .send(body("UPLOAD_REJECTED", "That file is too large."));
    }
    request.log.error({ name: (error as Error).name }, "unhandled error");
    return reply.code(500).send(body("INTERNAL", "Something went wrong."));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send(body("NOT_FOUND", "That item was not found."));
  });
}
