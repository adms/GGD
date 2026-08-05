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
    // ⚠️ `.tsx` **必須**在這裡：任何 React 元件的測試都得是 `.tsx`（它有 JSX），
    // 而 2026-08-05 之前這個樣式只收 `.ts` —— 也就是**整個副檔名被靜默排除**。
    // 一條寫好的元件守衛會安靜地不跑，而 `pnpm test` 照樣全綠：
    // 檔案數少一個沒有人會發現。`fieldHint.test.tsx`（欄位說明渲染）就是
    // 第一個踩到的，它在被加進來的那一刻是「綠的」，因為它根本沒被執行。
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
