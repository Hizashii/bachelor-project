// This file creates the small API shell and intentionally exposes no production data routes.

import Fastify, { type FastifyInstance } from "fastify";
import { loadApiEnvironment } from "./config/env.ts";

export function buildApi(): FastifyInstance {
  const environment = loadApiEnvironment();
  const server = Fastify({ logger: false });

  server.get("/health", async () => ({
    status: "ok",
    environment: environment.NODE_ENV,
    storageMode: environment.STORAGE_MODE,
  }));

  return server;
}
