// This file starts the product server. Settings come from environment variables only.

import { buildApp } from "./app.ts";
import { AuditLog } from "./audit/audit.ts";
import { randomIds, systemClock } from "./clock.ts";
import { MemoryMailer } from "./mail.ts";
import { MemoryStore } from "./storage/memoryStore.ts";

const DEFAULT_PORT = 3000;

export async function startServer(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (32+ characters).");
  }
  // Local development uses the in-memory store until the SharePoint store is configured.
  const store = new MemoryStore();
  const app = await buildApp({
    store,
    audit: new AuditLog(store, systemClock),
    clock: systemClock,
    ids: randomIds,
    mailer: new MemoryMailer(),
    config: {
      sessionSecret: secret,
      devLogin: process.env.AUTH_MODE === "dev",
    },
  });
  await app.listen({
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: "127.0.0.1",
  });
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Server failed to start.",
    );
    process.exit(1);
  });
}
