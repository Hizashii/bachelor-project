import { describe, expect, it } from "vitest";
import { loadApiEnvironment } from "./env.ts";

const localEnvironment = {
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
};

describe("API environment", () => {
  it("applies safe local defaults", () => {
    expect(
      loadApiEnvironment({
        ...localEnvironment,
        UNRELATED_HOST_SETTING: "ignored",
      }),
    ).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      SHAREPOINT_MODE: "disabled",
      MAX_UPLOAD_BYTES: 52_428_800,
    });
  });

  it("rejects an origin that contains a path", () => {
    expect(() =>
      loadApiEnvironment({
        ...localEnvironment,
        APP_ORIGIN: "https://freight.example.test/app",
      }),
    ).toThrow();
  });

  it("requires the approved SharePoint scope in graph mode", () => {
    expect(() =>
      loadApiEnvironment({ ...localEnvironment, SHAREPOINT_MODE: "graph" }),
    ).toThrow(/SHAREPOINT_TENANT_ID|SHAREPOINT_SITE_ID|SHAREPOINT_DRIVE_ID/);
  });

  it("rejects misspelled application settings", () => {
    for (const key of ["SHAREPOINT_MODEE", "MAX_UPLOAD_BYTE", "NODE_ENVI"]) {
      expect(() =>
        loadApiEnvironment({
          ...localEnvironment,
          [key]: "invalid",
        }),
      ).toThrow(key);
    }
  });

  it("requires HTTPS origins in production", () => {
    expect(() =>
      loadApiEnvironment({
        ...localEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      loadApiEnvironment({
        ...localEnvironment,
        DATABASE_URL: "https://db.example.test",
      }),
    ).toThrow();
  });
});
