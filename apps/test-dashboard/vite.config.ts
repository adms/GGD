/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev/CI-only dashboard. Talks to tools/testrunner (default 127.0.0.1:8799,
// override with VITE_RUNNER_URL).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
