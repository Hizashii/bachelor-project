import { z } from "zod";

const booleanEnvironmentValue = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().default(false));

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_ORIGIN: z.string().url().default("http://localhost:4173"),
    AUTH_MODE: z.enum(["mock", "entra"]).default("mock"),
    COOKIE_SECURE: booleanEnvironmentValue,
    SESSION_SECRET: z
      .string()
      .min(32)
      .default("local-demo-session-secret-change-me-32chars"),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(28_800),
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
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && !environment.COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production.",
      });
    }

    if (
      environment.NODE_ENV === "production" &&
      environment.SESSION_SECRET.includes("change-me")
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be replaced in production.",
      });
    }

    if (environment.AUTH_MODE === "entra") {
      for (const key of [
        "ENTRA_TENANT_ID",
        "ENTRA_CLIENT_ID",
        "ENTRA_CLIENT_SECRET",
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when AUTH_MODE=entra.`,
          });
        }
      }
    }
  });

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function loadApiEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${result.error.message}`);
  }
  return result.data;
}
