import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApi } from "./app.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { MicrosoftGraphClient } from "./storage/graphClient.ts";
import {
  SharePointStorageAdapter,
  UnavailableStorageAdapter,
} from "./storage/sharepointStorage.ts";
import type { StorageAdapter } from "./storage/types.ts";

export function createStorage(environment: ApiEnvironment): StorageAdapter {
  if (environment.SHAREPOINT_MODE !== "graph") {
    return new UnavailableStorageAdapter();
  }
  const graph = new MicrosoftGraphClient({
    tenantId: environment.SHAREPOINT_TENANT_ID ?? "",
    clientId: environment.SHAREPOINT_CLIENT_ID ?? "",
    clientSecret: environment.SHAREPOINT_CLIENT_SECRET ?? "",
  });
  return new SharePointStorageAdapter(graph, {
    driveId: environment.SHAREPOINT_DRIVE_ID ?? "",
    rootItemId: environment.SHAREPOINT_ROOT_ITEM_ID ?? "",
    cursorSecret: environment.STORAGE_CURSOR_SECRET ?? "",
  });
}

export async function startServer(
  environment: ApiEnvironment = loadApiEnvironment(),
) {
  const storage = createStorage(environment);
  const server = buildApi({ environment, storage });
  await storage.ensureInitialFolders();
  await server.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
  return server;
}

const runningFile = process.argv[1];
if (runningFile && resolve(runningFile) === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
