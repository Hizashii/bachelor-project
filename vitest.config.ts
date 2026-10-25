// This file makes Vitest discover small unit tests across the repository.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["**/*.test.ts"] } });
