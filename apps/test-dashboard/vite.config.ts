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
    include: ["src/**/*.test.ts"],
  },
});
