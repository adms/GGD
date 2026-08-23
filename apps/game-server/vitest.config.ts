import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// This package is the one that mixes bare `@ggd/shared/*` specifiers (resolved
// through the package `exports` map) with @ggd/shared's own extensionless
// relative imports, so it is where the dual-instance registry trap bites first
// — see vitest.shared.ts for the full story.
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // ⚡ owner 2026-08-23「盡量壓榨多執行緒跟記憶體在本地端最大加速」+「forks 16,
    // ⛔ 不要 threads」→「以上都同意」。⛔ threads 會炸(Babylon headless mock +
    // CJS/ESM 混用)。forks 也是 vitest 2.x 預設,明寫是為了讓換掉它變成看得見的決定。
    pool: "forks",
    poolOptions: { forks: { maxForks: 16, minForks: 4 } },
    // #207 —— 測試預設不往 `data/match-stats/` 寫檔。理由寫在檔案裡:
    // `data/replays/` 已經被測試產物淹過一次(95 個檔,只有 7 筆 championId)。
    setupFiles: ["src/analytics/testSetup.ts"],
  },
});
