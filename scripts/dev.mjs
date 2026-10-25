// This script starts the three local workspaces without adding a process manager.
import { spawn } from "node:child_process";

const commands = [
  ["apps/site", "dev"],
  ["apps/app", "dev"],
  ["apps/api", "dev"],
];

const children = commands.map(([workspace, script]) => {
  const command = `npm run ${script} --workspace ${workspace}`;
  const executable = process.platform === "win32" ? "cmd.exe" : "npm";
  const argumentsForCommand =
    process.platform === "win32"
      ? ["/d", "/s", "/c", command]
      : ["run", script, "--workspace", workspace];
  return spawn(executable, argumentsForCommand, { stdio: "inherit" });
});

function stopChild(child) {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGINT");
}

function stopAllChildren() {
  children.forEach(stopChild);
  process.exit(0);
}

process.on("SIGINT", stopAllChildren);
process.on("SIGTERM", stopAllChildren);
