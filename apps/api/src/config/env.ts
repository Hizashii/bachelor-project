import { z } from "zod";

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  }, "must be an HTTP or HTTPS origin without a path");

const booleanEnvironmentValue = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().default(false));

const MIN_SESSION_SECONDS = 300;
const MAX_SESSION_SECONDS = 86_400;
const DEFAULT_SESSION_SECONDS = 28_800;
const DEFAULT_MAX_UPLOAD_BYTES = 52_428_800;
const MAX_UPLOAD_BYTES_LIMIT = 5_000_000_000;
const MAX_PORT = 65_535;
const DEFAULT_LOGIN_ATTEMPTS_PER_MINUTE = 10;
const DEFAULT_REQUESTS_PER_MINUTE = 600;

const postgresUrlSchema = z
  .string()
  .regex(/^postgres(?:ql)?:\/\//, "must use a PostgreSQL connection URL");

const environmentKeys = new Set([
  "NODE_ENV",
  "APP_ORIGIN",
  "API_ORIGIN",
  "API_HOST",
  "API_PORT",
  "DATABASE_URL",
  "COOKIE_SECURE",
  "SESSION_TTL_SECONDS",
  "TRUST_PROXY",
  "LOGIN_ATTEMPTS_PER_MINUTE",
  "REQUESTS_PER_MINUTE",
  "MAX_UPLOAD_BYTES",
  "SHAREPOINT_MODE",
  "SHAREPOINT_TENANT_ID",
  "SHAREPOINT_SITE_ID",
  "SHAREPOINT_DRIVE_ID",
  "SHAREPOINT_CLIENT_ID",
  "SHAREPOINT_CLIENT_SECRET",
  "SHAREPOINT_ROOT_ITEM_ID",
  "STORAGE_CURSOR_SECRET",
  "IMPORT_MAX_FILE_MB",
  "IMPORT_MAX_ROWS",
  "IMPORT_MAX_COLUMNS",
  "IMPORT_MAX_CONCURRENT_JOBS",
  "IMPORT_MAX_ATTEMPTS",
  "IMPORT_RETENTION_MINUTES",
  "STORAGE_MODE",
  "LOCAL_STORAGE_DIR",
]);

// A misspelled setting in one of our own groups is an error, not a silent default.
const OWN_PREFIXES = [
  "SHAREPOINT_",
  "DATABASE_",
  "STORAGE_",
  "IMPORT_",
  "MAX_UPLOAD",
  "SESSION_",
  "LOGIN_",
  "NODE_ENV",
  "LOCAL_STORAGE_",
];

function assertKnownApplicationKeys(
  values: Readonly<Record<string, string | undefined>>,
): void {
  const unsupported = Object.keys(values).filter(
    (key) =>
      OWN_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
      !environmentKeys.has(key),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported Freight Desk environment variable(s): ${unsupported.join(", ")}`,
    );
  }
}

const SHAREPOINT_GRAPH_KEYS = [
  "SHAREPOINT_TENANT_ID",
  "SHAREPOINT_SITE_ID",
  "SHAREPOINT_DRIVE_ID",
  "SHAREPOINT_CLIENT_ID",
  "SHAREPOINT_CLIENT_SECRET",
  "SHAREPOINT_ROOT_ITEM_ID",
  "STORAGE_CURSOR_SECRET",
] as const;

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ORIGIN: originSchema,
    API_ORIGIN: originSchema,
    API_HOST: z.string().trim().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(3000),
    DATABASE_URL: postgresUrlSchema,
    COOKIE_SECURE: booleanEnvironmentValue,
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(MIN_SESSION_SECONDS)
      .max(MAX_SESSION_SECONDS)
      .default(DEFAULT_SESSION_SECONDS),
    // true when a trusted proxy (the HTTPS ingress) forwards the real client address.
    TRUST_PROXY: booleanEnvironmentValue,
    // How many sign-in attempts one address may make per minute.
    LOGIN_ATTEMPTS_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .default(DEFAULT_LOGIN_ATTEMPTS_PER_MINUTE),
    // How many requests of any kind one address may make per minute.
    REQUESTS_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .default(DEFAULT_REQUESTS_PER_MINUTE),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_UPLOAD_BYTES_LIMIT)
      .default(DEFAULT_MAX_UPLOAD_BYTES),
    STORAGE_MODE: z.enum(["local", "sharepoint"]).default("local"),
    LOCAL_STORAGE_DIR: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .default("data/storage"),
    SHAREPOINT_MODE: z.enum(["disabled", "graph"]).default("disabled"),
    SHAREPOINT_TENANT_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_SITE_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_DRIVE_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_CLIENT_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_CLIENT_SECRET: z.string().trim().min(1).optional(),
    SHAREPOINT_ROOT_ITEM_ID: z.string().trim().min(1).optional(),
    STORAGE_CURSOR_SECRET: z.string().trim().min(16).optional(),
  })
  .strict()
  .superRefine((environment, context) => {
    const fail = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (environment.NODE_ENV === "production") {
      if (!environment.COOKIE_SECURE) {
        fail("COOKIE_SECURE", "COOKIE_SECURE must be true in production.");
      }
    }
    if (environment.STORAGE_MODE !== "sharepoint") return;
    if (environment.SHAREPOINT_MODE !== "graph") {
      fail(
        "SHAREPOINT_MODE",
        "SHAREPOINT_MODE must be graph for SharePoint storage.",
      );
      return;
    }
    for (const key of SHAREPOINT_GRAPH_KEYS) {
      if (!environment[key]) {
        fail(key, "is required when SHAREPOINT_MODE is graph");
      }
    }
  });

export const productionEnvironmentSchema = apiEnvironmentSchema.superRefine(
  (environment, context) => {
    for (const key of ["APP_ORIGIN", "API_ORIGIN"] as const) {
      if (environment[key].startsWith("http://")) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "must use HTTPS in production",
        });
      }
    }
  },
);

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function loadApiEnvironment(
  values: Readonly<Record<string, string | undefined>> = process.env,
): ApiEnvironment {
  assertKnownApplicationKeys(values);
  const input = Object.fromEntries(
    Object.keys(apiEnvironmentSchema.shape).map((key) => [key, values[key]]),
  );
  input.STORAGE_MODE =
    values.STORAGE_MODE ??
    (values.SHAREPOINT_MODE === "graph" ? "sharepoint" : "local");
  const parsed = apiEnvironmentSchema.safeParse(input);
  if (!parsed.success) throw new Error(describe(parsed.error));
  if (
    parsed.data.NODE_ENV === "production" &&
    values.STORAGE_MODE === undefined &&
    values.SHAREPOINT_MODE !== "graph"
  ) {
    throw new Error(
      "Invalid settings: STORAGE_MODE must be set explicitly in production.",
    );
  }
  if (parsed.data.NODE_ENV !== "production") return parsed.data;
  const production = productionEnvironmentSchema.safeParse(parsed.data);
  if (!production.success) throw new Error(describe(production.error));
  return production.data;
}

function describe(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return `Invalid settings: ${lines.join("; ")}`;
}
