// This file runs gitleaks from PATH or its WinGet package without weakening the scan.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getWinGetGitleaksPath } from "./gitleaks-path.mjs";

function findExecutable() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) {
    return "gitleaks";
  }

  const winGetPath = getWinGetGitleaksPath(process.env.LOCALAPPDATA);
  return winGetPath && existsSync(winGetPath) ? winGetPath : "gitleaks";
}

const result = spawnSync(findExecutable(), process.argv.slice(2), {
  stdio: "inherit",
});
if (result.error) {
  console.error(
    "Gitleaks is not installed. Install it with winget and try again.",
  );
}
process.exit(result.status ?? 1);
