import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const API_PORT = 3100;
const APP_PORT = 5178;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`;
const API_STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 100;

if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "Set TEST_DATABASE_URL to a throwaway PostgreSQL database first.",
  );
  process.exit(1);
}

async function waitForApi() {
  const deadline = Date.now() + API_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(API_HEALTH_URL);
      if (response.ok) return;
    } catch {
      // The API is still starting or the database migration is in progress.
    }
    await new Promise((resolve) =>
      setTimeout(resolve, HEALTH_POLL_INTERVAL_MS),
    );
  }
  throw new Error(
    `The API did not become ready within ${API_STARTUP_TIMEOUT_MS}ms.`,
  );
}

const server = await createServer({
  root: "apps/app",
  server: {
    host: "127.0.0.1",
    port: APP_PORT,
    proxy: {
      "/api": `http://127.0.0.1:${API_PORT}`,
      "/auth": `http://127.0.0.1:${API_PORT}`,
    },
  },
});

const storageRoot = await mkdtemp(join(tmpdir(), "freight-desk-e2e-"));
const api = spawn(
  process.execPath,
  ["--experimental-strip-types", "tests/e2e/support/testServer.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_STORAGE_ROOT: storageRoot,
      E2E_API_PORT: String(API_PORT),
      E2E_APP_ORIGIN: APP_ORIGIN,
    },
  },
);
let exitCode = 1;
try {
  await waitForApi();
  await server.listen();
  const runner = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_BASE_URL: APP_ORIGIN },
    },
  );
  exitCode = await new Promise((resolve) => {
    runner.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
} finally {
  await server.close();
  stopProcess(api);
  await rm(storageRoot, { recursive: true, force: true });
}
process.exit(exitCode);

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
}
