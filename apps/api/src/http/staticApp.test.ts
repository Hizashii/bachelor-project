// Tests for serving the built web app next to the API.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerStaticApp } from "./staticApp.ts";

async function appWithFiles() {
  const root = await mkdtemp(join(tmpdir(), "static-test-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<html>start</html>");
  await writeFile(join(root, "assets", "app.js"), "console.log(1)");
  await writeFile(join(tmpdir(), "secret.txt"), "private");
  const app = Fastify();
  registerStaticApp(app, root);
  return app;
}

describe("registerStaticApp", () => {
  it("serves files and falls back to the start page for app routes", async () => {
    const app = await appWithFiles();
    const script = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(script.headers["content-type"]).toContain("javascript");
    expect(script.headers["cache-control"]).toContain("immutable");
    const route = await app.inject({ method: "GET", url: "/compare" });
    expect(route.body).toContain("start");
  });

  it("never serves files outside the app folder and leaves API paths alone", async () => {
    const app = await appWithFiles();
    const outside = await app.inject({
      method: "GET",
      url: "/..%2Fsecret.txt",
    });
    expect(outside.body).not.toContain("private");
    const api = await app.inject({ method: "GET", url: "/api/unknown" });
    expect(api.statusCode).toBe(404);
  });

  it("answers 404 for a missing file, and no server error for a broken address", async () => {
    const app = await appWithFiles();
    expect(
      (await app.inject({ method: "GET", url: "/assets/missing.js" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/assets/app.js.map" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/%E0%A4%A" })).statusCode,
    ).toBeLessThan(500);
  });
});
