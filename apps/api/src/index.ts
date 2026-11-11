import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApi } from "./app.ts";
import { loadApiEnvironment } from "./config/env.ts";

export function startServer(): string {
  return "Freight Desk API";
}

export async function runServer(): Promise<void> {
  const environment = loadApiEnvironment();
  const server = buildApi({ environment });
  await server.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
