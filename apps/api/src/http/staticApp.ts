// Serves the built web app (apps/app/dist) from the same address as the API, so the browser
// talks to one HTTPS origin and cookies stay first-party. Unknown paths fall back to the
// app's start page so deep links such as /compare work after a reload.

import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const API_PREFIXES = ["/api/", "/auth/"];
const ONE_YEAR_SECONDS = 31_536_000;

export function registerStaticApp(app: FastifyInstance, root: string): void {
  app.get("/*", async (request, reply) => {
    const path = decodedPath(request.url);
    if (path === null) return reply.callNotFound();
    if (API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return reply.callNotFound();
    }
    // Only known file types are served; a missing file with an extension is a real 404.
    const extension = extname(path);
    if (extension !== "" && !(extension in TYPES)) return reply.callNotFound();
    const file = normalize(join(root, path));
    const inside = file === root || file.startsWith(root + sep);
    const asset = inside && extension !== "" ? await readIfFile(file) : null;
    if (extension !== "" && asset === null) return reply.callNotFound();
    const body = asset ?? (await readIfFile(join(root, "index.html")));
    if (!body) return reply.callNotFound();
    const isAsset = asset !== null;
    reply.type(
      TYPES[extname(isAsset ? file : "index.html")] ??
        "application/octet-stream",
    );
    if (isAsset && path.startsWith("/assets/")) {
      reply.header(
        "Cache-Control",
        `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
      );
    }
    return reply.send(body);
  });
}

function decodedPath(url: string): string | null {
  try {
    return decodeURIComponent(url.split("?")[0] ?? "/");
  } catch {
    return null;
  }
}

async function readIfFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
