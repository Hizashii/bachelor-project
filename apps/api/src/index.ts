import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApi } from "./app.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";

export async function startServer(
  environment: ApiEnvironment = loadApiEnvironment(),
) {
  const server = buildApi({ environment });
  await server.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
  return server;
}

const runningFile = process.argv[1];
if (runningFile && resolve(runningFile) === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
