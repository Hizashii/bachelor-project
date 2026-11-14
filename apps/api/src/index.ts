import { fileURLToPath } from "node:url";
import { createApiApp } from "./app.js";
import { requestPrincipalResolver } from "./auth.js";
import { MicrosoftGraphClient } from "./storage/graphClient.js";
import {
  SharePointStorageAdapter,
  UnavailableStorageAdapter,
} from "./storage/sharepointStorage.js";
import type { StorageAdapter } from "./storage/types.js";

export async function startServer(): Promise<void> {
  const storage = createStorageFromEnvironment();
  const app = await createApiApp({
    storage,
    resolvePrincipal: requestPrincipalResolver,
  });
  await storage.ensureInitialFolders();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

export function createStorageFromEnvironment(): StorageAdapter {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const rootItemId = process.env.SHAREPOINT_ROOT_ITEM_ID;
  const cursorSecret =
    process.env.STORAGE_CURSOR_SECRET ?? process.env.SESSION_SECRET;
  if (
    !tenantId ||
    !clientId ||
    !clientSecret ||
    !driveId ||
    !rootItemId ||
    !cursorSecret
  ) {
    return new UnavailableStorageAdapter();
  }
  const graph = new MicrosoftGraphClient({ tenantId, clientId, clientSecret });
  return new SharePointStorageAdapter(graph, {
    driveId,
    rootItemId,
    cursorSecret,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "API startup failed.",
    );
    process.exitCode = 1;
  });
}
