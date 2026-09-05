import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// This package is the one that mixes bare `@ggd/shared/*` specifiers (resolved
// through the package `exports` map) with @ggd/shared's own extensionless
// relative imports, so it is where the dual-instance registry trap bites first
// — see vitest.shared.ts for the full story.

// ⏱⏱ GH#1014 —— fork 數**照核數**，⛔ 不是永遠 16。
//
// ⭐ 量到的機制（2026-09-05 CI run 33976263791 attempt 1，⛔ 不是推測）：
//   · worker → 主行程的每一次 RPC（`onTaskUpdate`）都帶一顆 **60 秒**計時器
//     （birpc `DEFAULT_TIMEOUT = 6e4`，`dist/chunks/index.68735LiX.js:1`）。
//     ⛔ vitest 2.1.9 **沒有把它開成設定**：`createRuntimeRpc`（`rpc.C3q9uwRX.js`）與
//     `workers/forks.js` 的 `createForksRpcOptions` 都沒傳 `timeout` ⇒ 下面的 `testTimeout`
//     管的是**測試**時鐘，⛔ 管不到這一顆。
//   · `@vitest/runner` 的 `updateTask` 是 10ms debounce ⇒ 「run」狀態在 `beforeAll` 第一個真 I/O
//     （`analytics.test.ts` 的 `mkdtemp`）之後就送出去了；接著**同步**模擬整場比賽（12 隻 bot）
//     ⇒ 事件迴圈被鎖住 > 60 秒 ⇒ 主行程的回覆躺在 pipe 裡，⭐ **worker 自己的計時器在 timers phase
//     先觸發** ⇒ `[vitest-worker]: Timeout calling "onTaskUpdate"` ×3 ⇒ 那一檔的最終結果送不出去
//     ⇒ `Test Files 152 passed | 1 skipped (154)`：**一檔零裁決、零失敗、job 紅**。
//   · 同步區段⛔ 只有在**搶核**時才跨過 60 秒：runner 4 vCPU，`pnpm -r` 預設同時跑 4 個包 ×
//     每包 `maxForks: 16` ⇒ 量到 `collect 2042s + tests 4338s` 對 wall-clock 548s ＝ **11.6× 超額訂閱**。
//     同一份內容 attempt 2 綠（`analytics.test.ts` 108.8s 剛好沒跨線）⇒ 間歇。
//
// ⇒ ⭐ 治機制：`maxForks = min(16, 核數)`。owner 的 18 核 Mac 仍是 16
//   （2026-08-23「forks 16，⛔ 不要 threads」不變）；4 vCPU runner 變 4。
//   CI 那一側另外把 `--workspace-concurrency` 降成 1 並用 CLI 逐包分核（`.github/workflows/ci.yml`），
//   ⭐ 與 `tools/parallel-gates/ship.mjs` 的 FORKS_PER_SUITE 是同一個藥。
// 🔀 開關：`GGD_VITEST_MAX_FORKS=<n>` 直接指定（CLI `--poolOptions.forks.maxForks` 也照樣蓋得過）。
// ⛔ 不是把 60 秒拉長（拉不了）、⛔ 不是把那支測試縮短（承重守衛）、⛔ 不是靜音 unhandled rejection。
const MAX_FORKS = Number(process.env.GGD_VITEST_MAX_FORKS) || Math.min(16, availableParallelism());

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
    // ⏱ GH#1014：16 → min(16, 核數)；理由在檔頭。minForks 跟著夾，⛔ 不可以大於 maxForks。
    poolOptions: { forks: { maxForks: MAX_FORKS, minForks: Math.min(4, MAX_FORKS) } },
    // #207 —— 測試預設不往 `data/match-stats/` 寫檔。理由寫在檔案裡:
    // `data/replays/` 已經被測試產物淹過一次(95 個檔,只有 7 筆 championId)。
    setupFiles: ["src/analytics/testSetup.ts"],
  },
});
