import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApi } from "./app.ts";
import { type ApiEnvironment, loadApiEnvironment } from "./config/env.ts";
import { createDatabase, verifyDatabase } from "./db/pool.ts";
import { MicrosoftGraphClient } from "./storage/graphClient.ts";
import {
  LocalStorageAdapter,
  resolveLocalStorageRoot,
} from "./storage/localStorage.ts";
import { SharePointStorageAdapter } from "./storage/sharepointStorage.ts";
import type { StorageAdapter } from "./storage/types.ts";

export function createStorage(environment: ApiEnvironment): StorageAdapter {
  if (environment.STORAGE_MODE === "local") {
    return new LocalStorageAdapter(
      resolveLocalStorageRoot(environment.LOCAL_STORAGE_DIR),
    );
  }
  if (environment.SHAREPOINT_MODE !== "graph")
    throw new Error("SharePoint storage requires SHAREPOINT_MODE=graph.");
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
  const database = createDatabase(environment.DATABASE_URL);
  await verifyDatabase(database).catch(async (error: unknown) => {
    await database.end();
    throw error;
  });
  let storage: StorageAdapter;
  try {
    storage = createStorage(environment);
    await storage.ensureInitialFolders();
  } catch (error: unknown) {
    await database.end();
    const label =
      environment.STORAGE_MODE === "local" ? "Local storage" : "SharePoint";
    throw new Error(
      `${label} is not ready: ${error instanceof Error ? error.message : "unknown error"}. Run npm run check:setup.`,
    );
  }
  const server = buildApi({ environment, storage, database });
  server.addHook("onClose", async () => database.end());
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
