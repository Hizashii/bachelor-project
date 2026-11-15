// This file makes Vitest discover small unit tests across the repository.
// The database tests wipe one shared test database, so they run one file at a time.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
