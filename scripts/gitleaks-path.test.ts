// This file checks the Windows fallback used by the local secret scan.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getWinGetGitleaksPath } from "./gitleaks-path.mjs";

describe("gitleaks path", () => {
  it("finds the executable in a WinGet package", () => {
    const localAppData = "C:\\Users\\developer\\AppData\\Local";
    const packageName =
      "Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe";

    expect(getWinGetGitleaksPath(localAppData)).toBe(
      join(
        localAppData,
        "Microsoft",
        "WinGet",
        "Packages",
        packageName,
        "gitleaks.exe",
      ),
    );
  });

  it("returns nothing when local app data is absent", () => {
    expect(getWinGetGitleaksPath(undefined)).toBeUndefined();
  });
});
