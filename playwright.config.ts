// This file keeps browser tests ready without starting a product server yet.
import { defineConfig } from "@playwright/test";

export default defineConfig({ testDir: "./tests/e2e", timeout: 30_000 });
