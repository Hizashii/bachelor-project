// This file finds the WinGet gitleaks executable when Windows PATH does not include it.
import { join } from "node:path";

const GITLEAKS_PACKAGE =
  "Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe";

export function getWinGetGitleaksPath(localAppData) {
  if (!localAppData) {
    return undefined;
  }

  return join(
    localAppData,
    "Microsoft",
    "WinGet",
    "Packages",
    GITLEAKS_PACKAGE,
    "gitleaks.exe",
  );
}
