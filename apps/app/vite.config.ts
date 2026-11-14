// This file gives the product app a small Vite configuration.
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN ?? "http://localhost:3000",
      },
    },
  },
});
