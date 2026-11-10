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

const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_SESSION_SECONDS = 300;
const MAX_SESSION_SECONDS = 86_400;
const DEFAULT_SESSION_SECONDS = 28_800;

const postgresUrlSchema = z
  .string()
  .regex(/^postgres(?:ql)?:\/\//, "must use a PostgreSQL connection URL");

const environmentKeys = new Set([
  "NODE_ENV",
  "APP_ORIGIN",
  "API_ORIGIN",
  "API_HOST",
  "API_PORT",
  "SHAREPOINT_MODE",
  "SHAREPOINT_TENANT_ID",
  "SHAREPOINT_SITE_ID",
  "SHAREPOINT_DRIVE_ID",
  "SHAREPOINT_CLIENT_ID",
  "SHAREPOINT_CLIENT_SECRET",
  "SHAREPOINT_ROOT_ITEM_ID",
  "STORAGE_CURSOR_SECRET",
  "DATABASE_URL",
  "MAX_UPLOAD_BYTES",
  "AUTH_MODE",
  "COOKIE_SECURE",
  "SESSION_SECRET",
  "SESSION_TTL_SECONDS",
  "AUTHORIZED_USERS_JSON",
  "ENTRA_TENANT_ID",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "ENTRA_REDIRECT_URI",
  "ENTRA_POST_LOGOUT_REDIRECT_URI",
  "ENTRA_SCOPES",
]);

function assertKnownApplicationKeys(
  values: Readonly<Record<string, string | undefined>>,
): void {
  const unsupported = Object.keys(values).filter(
    (key) =>
      (key.startsWith("APP_") ||
        key.startsWith("API_") ||
        key.startsWith("SHAREPOINT_") ||
        key.startsWith("DATABASE_") ||
        key.startsWith("MAX_") ||
        key.startsWith("NODE_ENV")) &&
      !environmentKeys.has(key),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported Freight Desk environment variable(s): ${unsupported.join(", ")}`,
    );
  }
}

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ORIGIN: originSchema,
    API_ORIGIN: originSchema,
    API_HOST: z.string().trim().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    SHAREPOINT_MODE: z.enum(["disabled", "graph"]).default("disabled"),
    SHAREPOINT_TENANT_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_SITE_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_DRIVE_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_CLIENT_ID: z.string().trim().min(1).optional(),
    SHAREPOINT_CLIENT_SECRET: z.string().trim().min(1).optional(),
    SHAREPOINT_ROOT_ITEM_ID: z.string().trim().min(1).optional(),
    STORAGE_CURSOR_SECRET: z.string().trim().min(16).optional(),
    AUTH_MODE: z.enum(["mock", "entra"]).default("mock"),
    COOKIE_SECURE: booleanEnvironmentValue,
    SESSION_SECRET: z
      .string()
      .min(MIN_SESSION_SECRET_LENGTH)
      .default("local-demo-session-secret-change-me-32chars"),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(MIN_SESSION_SECONDS)
      .max(MAX_SESSION_SECONDS)
      .default(DEFAULT_SESSION_SECONDS),
    AUTHORIZED_USERS_JSON: z.string().optional(),
    ENTRA_TENANT_ID: z.string().min(1).optional(),
    ENTRA_CLIENT_ID: z.string().min(1).optional(),
    ENTRA_CLIENT_SECRET: z.string().min(1).optional(),
    ENTRA_REDIRECT_URI: z
      .string()
      .url()
      .default("http://localhost:4173/auth/callback"),
    ENTRA_POST_LOGOUT_REDIRECT_URI: z
      .string()
      .url()
      .default("http://localhost:4173/login"),
    ENTRA_SCOPES: z.string().default("openid profile email"),
    DATABASE_URL: postgresUrlSchema.optional(),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(5_000_000_000)
      .default(52_428_800),
  })
  .strict()
  .superRefine((environment, context) => {
    checkAuthentication(environment, context);
    if (environment.SHAREPOINT_MODE !== "graph") return;

    if (!environment.SHAREPOINT_TENANT_ID) {
      context.addIssue({
        code: "custom",
        path: ["SHAREPOINT_TENANT_ID"],
        message: "is required when SHAREPOINT_MODE is graph",
      });
    }
    for (const key of [
      "SHAREPOINT_CLIENT_ID",
      "SHAREPOINT_CLIENT_SECRET",
      "SHAREPOINT_ROOT_ITEM_ID",
      "STORAGE_CURSOR_SECRET",
    ] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "is required when SHAREPOINT_MODE is graph",
        });
      }
    }
    if (!environment.SHAREPOINT_DRIVE_ID) {
      context.addIssue({
        code: "custom",
        path: ["SHAREPOINT_DRIVE_ID"],
        message: "is required when SHAREPOINT_MODE is graph",
      });
    }
  });

function checkAuthentication(
  environment: {
    NODE_ENV: string;
    AUTH_MODE: string;
    COOKIE_SECURE: boolean;
    SESSION_SECRET: string;
    ENTRA_TENANT_ID?: string;
    ENTRA_CLIENT_ID?: string;
    ENTRA_CLIENT_SECRET?: string;
  },
  context: z.RefinementCtx,
): void {
  const fail = (path: string, message: string) =>
    context.addIssue({ code: "custom", path: [path], message });
  if (environment.NODE_ENV === "production") {
    if (!environment.COOKIE_SECURE) {
      fail("COOKIE_SECURE", "COOKIE_SECURE must be true in production.");
    }
    if (environment.SESSION_SECRET.includes("change-me")) {
      fail("SESSION_SECRET", "SESSION_SECRET must be replaced in production.");
    }
    if (environment.AUTH_MODE === "mock") {
      fail("AUTH_MODE", "Mock sign-in is not allowed in production.");
    }
  }
  if (environment.AUTH_MODE !== "entra") return;
  for (const key of [
    "ENTRA_TENANT_ID",
    "ENTRA_CLIENT_ID",
    "ENTRA_CLIENT_SECRET",
  ] as const) {
    if (!environment[key])
      fail(key, `${key} is required when AUTH_MODE=entra.`);
  }
}

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
  const environment = apiEnvironmentSchema.parse({
    NODE_ENV: values.NODE_ENV,
    APP_ORIGIN: values.APP_ORIGIN,
    API_ORIGIN: values.API_ORIGIN,
    API_HOST: values.API_HOST,
    API_PORT: values.API_PORT,
    SHAREPOINT_MODE: values.SHAREPOINT_MODE,
    SHAREPOINT_TENANT_ID: values.SHAREPOINT_TENANT_ID,
    SHAREPOINT_SITE_ID: values.SHAREPOINT_SITE_ID,
    SHAREPOINT_DRIVE_ID: values.SHAREPOINT_DRIVE_ID,
    SHAREPOINT_CLIENT_ID: values.SHAREPOINT_CLIENT_ID,
    SHAREPOINT_CLIENT_SECRET: values.SHAREPOINT_CLIENT_SECRET,
    SHAREPOINT_ROOT_ITEM_ID: values.SHAREPOINT_ROOT_ITEM_ID,
    STORAGE_CURSOR_SECRET: values.STORAGE_CURSOR_SECRET,
    AUTH_MODE: values.AUTH_MODE,
    COOKIE_SECURE: values.COOKIE_SECURE,
    SESSION_SECRET: values.SESSION_SECRET,
    SESSION_TTL_SECONDS: values.SESSION_TTL_SECONDS,
    AUTHORIZED_USERS_JSON: values.AUTHORIZED_USERS_JSON,
    ENTRA_TENANT_ID: values.ENTRA_TENANT_ID,
    ENTRA_CLIENT_ID: values.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: values.ENTRA_CLIENT_SECRET,
    ENTRA_REDIRECT_URI: values.ENTRA_REDIRECT_URI,
    ENTRA_POST_LOGOUT_REDIRECT_URI: values.ENTRA_POST_LOGOUT_REDIRECT_URI,
    ENTRA_SCOPES: values.ENTRA_SCOPES,
    DATABASE_URL: values.DATABASE_URL,
    MAX_UPLOAD_BYTES: values.MAX_UPLOAD_BYTES,
  });
  return environment.NODE_ENV === "production"
    ? productionEnvironmentSchema.parse(environment)
    : environment;
}
