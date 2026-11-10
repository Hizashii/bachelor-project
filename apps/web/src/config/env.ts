// This file validates browser-safe configuration and rejects missing public settings.

import { z } from "zod";

const environmentSchema = z.object({
  VITE_API_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export type WebEnvironment = z.infer<typeof environmentSchema>;

const result = environmentSchema.safeParse(import.meta.env);
if (!result.success) {
  throw new Error(`Invalid web environment: ${result.error.message}`);
}

export const webEnvironment: WebEnvironment = result.data;
