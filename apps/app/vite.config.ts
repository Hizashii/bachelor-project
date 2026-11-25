// This file gives the product app a small Vite configuration.
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN ?? "http://localhost:3000",
      },
      "/auth": {
        target: process.env.API_ORIGIN ?? "http://localhost:3000",
      },
    },
  },
});
