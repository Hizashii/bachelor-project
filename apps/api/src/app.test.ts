import { describe, expect, it } from "vitest";
import { buildApi } from "./app.ts";
import { loadApiEnvironment } from "./config/env.ts";

const environment = loadApiEnvironment({
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
});

describe("API application boundary", () => {
  it("exposes a health response with baseline security headers", async () => {
    const api = buildApi({ environment });

    try {
      const response = await api.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        service: "freight-desk-api",
      });
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["cache-control"]).toBe("no-store");

      const missingRoute = await api.inject({
        method: "GET",
        url: "/does-not-exist",
      });
      expect(missingRoute.statusCode).toBe(404);
      expect(missingRoute.json()).toEqual({
        error: "not_found",
        message: "The requested resource was not found.",
      });
    } finally {
      await api.close();
    }
  });
});
