/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by nginx at /editor/ in the dev profile; talks to the dev-only
// content-api (default 127.0.0.1:8787, override VITE_CONTENT_API_URL) and, for
// the AI-icon / AI-fill controls, the Go platform's AI proxy at /api/v1
// (default localhost:8080, override VITE_PLATFORM_API_URL — same-origin under
// nginx in the dev profile). The provider API key stays server-side; the editor
// only ever calls the proxy.
export default defineConfig({
  base: "/editor/",
  plugins: [react()],
  server: {
    port: 5174,
    host: "127.0.0.1",
    proxy: {
      "/content-api": {
        target: process.env.VITE_CONTENT_API_URL ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/api": {
        target: process.env.VITE_PLATFORM_API_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
