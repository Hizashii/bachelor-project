// This file validates server configuration and does not load customer data.

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  STORAGE_MODE: z.enum(["demo", "sharepoint"]).default("demo"),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function loadApiEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${result.error.message}`);
  }
  return result.data;
}
