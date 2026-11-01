import { spawn } from "node:child_process";
import { createServer } from "vite";

const server = await createServer({
  root: "apps/app",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});

await server.listen();

const runner = spawn(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test"],
  { stdio: "inherit" },
);

const exitCode = await new Promise((resolve) => {
  runner.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

await server.close();
process.exit(exitCode);
