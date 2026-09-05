import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// This package is the one that mixes bare `@ggd/shared/*` specifiers (resolved
// through the package `exports` map) with @ggd/shared's own extensionless
// relative imports, so it is where the dual-instance registry trap bites first
// — see vitest.shared.ts for the full story.
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    // ⏱ GH#979 —— vitest 預設 5 秒在 CI runner 上不夠（見 repo 根的 vitest.config.ts）。
    //   ⭐ 放寬**時鐘**，⛔ 不是放寬斷言。
    //
    // ⚠️ ⭐ 這一包要 **300 秒**而不是 60 —— 因為 `replay.test.ts` 的四條在
    //   `it` 裡**模擬整場比賽**（本機單條最慢 **22.0 秒**、整檔 24.9 秒）。
    //   2026-09-05 實測：60 秒在 GitHub runner 上**還是不夠**（`Test timed out in 60000ms`），
    //   而同一批在本機 **27/27 全綠**。
    //   ⇒ 本機 22 秒 × 一個 runner 慢 3–5 倍的係數 ⇒ 300 秒是量出來的，⛔ 不是憑感覺。
    // ⚠️ 代價：一支真的掛住的測試要 5 分鐘才被殺 —— 那正好是 CLAUDE.md 第零守則⏲
    //   「跑超過 5 分鐘就去看它是不是掛了」的那條線，而 `ship.mjs` 的逐 suite 看門狗守著它。
    testTimeout: 300_000,
    hookTimeout: 300_000,
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
