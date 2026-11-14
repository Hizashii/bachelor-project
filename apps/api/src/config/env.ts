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
  "DATABASE_URL",
  "MAX_UPLOAD_BYTES",
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
    if (environment.SHAREPOINT_MODE !== "graph") return;

    if (!environment.SHAREPOINT_TENANT_ID) {
      context.addIssue({
        code: "custom",
        path: ["SHAREPOINT_TENANT_ID"],
        message: "is required when SHAREPOINT_MODE is graph",
      });
    }
    if (!environment.SHAREPOINT_SITE_ID) {
      context.addIssue({
        code: "custom",
        path: ["SHAREPOINT_SITE_ID"],
        message: "is required when SHAREPOINT_MODE is graph",
      });
    }
    if (!environment.SHAREPOINT_DRIVE_ID) {
      context.addIssue({
        code: "custom",
        path: ["SHAREPOINT_DRIVE_ID"],
        message: "is required when SHAREPOINT_MODE is graph",
      });
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
    DATABASE_URL: values.DATABASE_URL,
    MAX_UPLOAD_BYTES: values.MAX_UPLOAD_BYTES,
  });
  return environment.NODE_ENV === "production"
    ? productionEnvironmentSchema.parse(environment)
    : environment;
}
