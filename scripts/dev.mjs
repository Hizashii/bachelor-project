// This script starts the three local workspaces without adding a process manager.
import { spawn } from "node:child_process";

const commands = [
  ["apps/site", "dev"],
  ["apps/app", "dev"],
  ["apps/api", "dev"],
];

const children = commands.map(([workspace, script]) =>
  spawn("npm.cmd", ["run", script, "--workspace", workspace], {
    stdio: "inherit",
  }),
);
process.on("SIGINT", () => {
  children.forEach((child) => {
    child.kill();
  });
});
