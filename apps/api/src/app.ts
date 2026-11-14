import Fastify, { type FastifyInstance } from "fastify";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { serializeApiError } from "./http/errors.ts";

export type BuildApiOptions = {
  environment?: ApiEnvironment;
};

export function buildApi(options: BuildApiOptions = {}): FastifyInstance {
  const environment = options.environment ?? loadApiEnvironment();
  const server = Fastify({ logger: environment.NODE_ENV !== "test" });

  server.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  server.get("/health", async () => ({
    status: "ok",
    service: "freight-desk-api",
  }));

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: "not_found",
      message: "The requested resource was not found.",
    }),
  );

  server.setErrorHandler((error, _request, reply) => {
    const response = serializeApiError(error);
    return reply.code(response.statusCode).send(response.body);
  });

  return server;
}
