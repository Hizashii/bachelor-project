import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadApiEnvironment } from "./env.ts";

const localEnvironment = {
  APP_ORIGIN: "http://localhost:4173",
  API_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/freight",
};

const productionEnvironment = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.test",
  API_ORIGIN: "https://app.example.test",
  COOKIE_SECURE: "true",
  DATABASE_URL:
    "postgresql://user:pass@db.example.test:5432/freight?sslmode=require",
  SHAREPOINT_MODE: "graph",
  SHAREPOINT_TENANT_ID: "tenant",
  SHAREPOINT_SITE_ID: "site",
  SHAREPOINT_DRIVE_ID: "drive",
  SHAREPOINT_CLIENT_ID: "sp-client",
  SHAREPOINT_CLIENT_SECRET: "sp-secret",
  SHAREPOINT_ROOT_ITEM_ID: "root",
  STORAGE_CURSOR_SECRET: "a-cursor-secret-of-sufficient-length",
};

describe("API environment", () => {
  it("applies safe local defaults", () => {
    expect(
      loadApiEnvironment({
        ...localEnvironment,
        UNRELATED_HOST_SETTING: "ignored",
        APP_BASE_URL: "x",
      }),
    ).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      SHAREPOINT_MODE: "disabled",
      MAX_UPLOAD_BYTES: 52_428_800,
    });
  });

  it("needs a PostgreSQL database for accounts", () => {
    expect(() =>
      loadApiEnvironment({ ...localEnvironment, DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      loadApiEnvironment({
        ...localEnvironment,
        DATABASE_URL: "https://db.example.test",
      }),
    ).toThrow(/PostgreSQL/);
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
    for (const key of [
      "SHAREPOINT_MODEE",
      "MAX_UPLOAD_BYTE",
      "NODE_ENVI",
      "SESSION_TTL",
    ]) {
      expect(() =>
        loadApiEnvironment({ ...localEnvironment, [key]: "invalid" }),
      ).toThrow(key);
    }
  });

  it("ignores unrelated desktop session variables", () => {
    expect(() =>
      loadApiEnvironment({ ...localEnvironment, SESSION_MANAGER: "gnome" }),
    ).not.toThrow();
  });

  it("accepts a complete production configuration", () => {
    expect(() => loadApiEnvironment(productionEnvironment)).not.toThrow();
  });

  it("accepts an explicitly selected local adapter in production", () => {
    expect(() =>
      loadApiEnvironment({
        ...productionEnvironment,
        STORAGE_MODE: "local",
        SHAREPOINT_MODE: "disabled",
      }),
    ).not.toThrow();
  });

  it("requires an explicit storage choice in production", () => {
    expect(() =>
      loadApiEnvironment({
        ...productionEnvironment,
        SHAREPOINT_MODE: "disabled",
      }),
    ).toThrow(/STORAGE_MODE must be set explicitly/);
  });

  it.each([
    [
      "addresses that are not HTTPS",
      {
        APP_ORIGIN: "http://app.example.test",
        API_ORIGIN: "http://app.example.test",
      },
      /HTTPS/,
    ],
    ["insecure cookies", { COOKIE_SECURE: "false" }, /COOKIE_SECURE/],
    [
      "a missing SharePoint secret",
      { SHAREPOINT_CLIENT_SECRET: undefined },
      /SHAREPOINT_CLIENT_SECRET/,
    ],
    ["a missing database", { DATABASE_URL: undefined }, /DATABASE_URL/],
  ])("refuses production with %s", (_name, change, message) => {
    expect(() =>
      loadApiEnvironment({ ...productionEnvironment, ...change }),
    ).toThrow(message);
  });

  it("accepts the settings listed in .env.example", () => {
    const values: Record<string, string> = {};
    const example = readFileSync(
      new URL("../../../../.env.example", import.meta.url),
      "utf8",
    );
    for (const line of example.split(/\r?\n/)) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line);
      if (match?.[1]) values[match[1]] = match[2] ?? "";
    }
    expect(() => loadApiEnvironment(values)).not.toThrow();
  });
});
