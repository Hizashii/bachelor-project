// Gets a fresh checkout ready, so `git pull` and `npm run start` are all a developer needs.
// Each step is safe to repeat: it only acts when something is missing.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import net from "node:net";

const PORTS = [3000, 4321, 5173];
const CONNECT_TIMEOUT_MS = 2_000;
const DATABASE_WAIT_MS = 60_000;
const DEFAULT_POSTGRES_PORT = 5432;
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options,
  });
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function ensureEnvironmentFile() {
  if (existsSync(".env.local")) return;
  copyFileSync(".env.example", ".env.local");
  console.log("Created .env.local from .env.example.");
}

function ensureDependencies() {
  if (existsSync("node_modules")) return;
  console.log("Installing dependencies (first run only)...");
  if (run(npm, ["install"]).status !== 0) fail("npm install failed.");
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_URL="));
  return line?.slice("DATABASE_URL=".length).trim() ?? "";
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: CONNECT_TIMEOUT_MS });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

async function ensurePortsFree() {
  for (const port of PORTS) {
    if (await portIsFree(port)) continue;
    fail(
      `Port ${port} is already in use. Another copy of the app is probably still running.\n` +
        "Stop it first (close its terminal, or end the node process using that port), then run npm run start again.",
    );
  }
}

async function waitForDatabase(host, port) {
  const deadline = Date.now() + DATABASE_WAIT_MS;
  while (Date.now() < deadline) {
    if (await canConnect(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

async function ensureDatabase() {
  const url = new URL(databaseUrl() || "postgresql://localhost");
  const port = Number(url.port || DEFAULT_POSTGRES_PORT);
  if (await canConnect(url.hostname, port)) return;
  const docker = run("docker", ["--version"], { stdio: "ignore" });
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (docker.status === 0 && local && port === DEFAULT_POSTGRES_PORT) {
    console.log("PostgreSQL is not running. Starting it with Docker...");
    run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
    if (await waitForDatabase(url.hostname, port)) return;
  }
  fail(
    `PostgreSQL is not reachable at ${url.hostname}:${port}.\n` +
      "Start PostgreSQL, or install Docker and run npm run start again (it starts the database for you).\n" +
      "To use another database, set DATABASE_URL in .env.local.",
  );
}

function migrateAndSeed() {
  if (run(npm, ["run", "db:migrate"], { stdio: "ignore" }).status !== 0) {
    fail("The database migration failed. Run npm run db:migrate to see why.");
  }
  const seeded = spawn(npm, ["run", "seed:users"], { shell: isWindows });
  let output = "";
  seeded.stdout.on("data", (chunk) => {
    output += chunk;
  });
  return new Promise((resolve) =>
    seeded.on("close", () => {
      const created = output
        .split(/\r?\n/)
        .filter((line) => / \/ /.test(line) && line.includes("@"));
      if (created.length > 0) {
        console.log("\nNew local accounts (shown once):");
        for (const line of created) console.log(`  ${line}`);
        console.log("");
      }
      resolve();
    }),
  );
}

export async function prepare() {
  ensureEnvironmentFile();
  ensureDependencies();
  await ensurePortsFree();
  await ensureDatabase();
  await migrateAndSeed();
}
