// This file starts the local API shell; business routes will be added later.

import { buildApi } from "./app.ts";
import { loadApiEnvironment } from "./config/env.ts";

export async function startServer(): Promise<void> {
  const environment = loadApiEnvironment();
  const server = buildApi();
  await server.listen({ host: environment.API_HOST, port: environment.API_PORT });
}

startServer().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
