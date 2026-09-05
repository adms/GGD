/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by nginx at /editor/ in the dev profile; talks to the dev-only
// content-api (default 127.0.0.1:8787, override VITE_CONTENT_API_URL) and, for
// the AI-icon / AI-fill controls, the Go platform's AI proxy at /api/v1
// (default localhost:8080, override VITE_PLATFORM_API_URL — same-origin under
// nginx in the dev profile). The provider API key stays server-side; the editor
// only ever calls the proxy.
export default defineConfig(({ mode }) => ({
  base: "/editor/",
  // `.env.*` is intentionally ignored repository-wide.  Desktop mode must be
  // reproducible in a clean clone, so compile the local-loopback authority flag
  // from the tracked Vite mode instead of relying on an untracked env file.
  define: mode === "desktop"
    ? { "import.meta.env.VITE_DESKTOP": JSON.stringify("1") }
    : undefined,
  plugins: [react()],
  server: {
    port: 5174,
    // A silent 5174 -> 5175 fallback leaves the UI readable but makes every
    // guarded save fail because Origin is part of the dev-write authority.
    // Custom ports stay supported: start Vite explicitly and pass the same
    // loopback origin through GGD_EDITOR_ORIGINS to content-api.
    strictPort: true,
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
    // ⏱ GH#979 —— vitest 預設逾時 **5 秒**，而 CI runner 在負載下擠不進去
    //   （`mobWavesSave` 本機 1.5 秒 / CI **13,299ms**）。
    // ⚠️ ⭐ 根目錄的 `vitest.config.ts` **套不到這裡** —— 這個檔存在，
    //   而 vitest 的 findUp 找到它就停了（`packages/shared/vitest.config.ts`
    //   的檔頭把這個機制寫得很清楚）。⇒ 每一個有自己 vite/vitest 設定的套件
    //   都要自己寫一次，⛔ 那正是這一格存在的理由。
    // ⭐ 這是放寬**時鐘**，⛔ 不是放寬斷言。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    environment: "node",
    // ⚠️ `.tsx` **必須**在這裡：任何 React 元件的測試都得是 `.tsx`（它有 JSX），
    // 而 2026-08-05 之前這個樣式只收 `.ts` —— 也就是**整個副檔名被靜默排除**。
    // 一條寫好的元件守衛會安靜地不跑，而 `pnpm test` 照樣全綠：
    // 檔案數少一個沒有人會發現。`fieldHint.test.tsx`（欄位說明渲染）就是
    // 第一個踩到的，它在被加進來的那一刻是「綠的」，因為它根本沒被執行。
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
