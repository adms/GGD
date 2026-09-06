import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineWorkspace } from "vitest/config";
import base from "./vitest.config";

/**
 * ⏱⏱ GH#1014 ① —— 把「一次 I/O `await` 之後緊接著 > 60 秒同步模擬」的那幾支
 * 移進**自己的 shard**（`sim`），⛔ 不再與其餘 150 支搶同一批 fork。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 機制（讀出貨的 dist 量到的，⛔ 不是推測）
 * ─────────────────────────────────────────────────────────────────────────────
 *  · worker → 主行程的 `onTaskUpdate` 是 birpc 呼叫，帶 **60 秒硬編碼**計時器
 *    （`dist/chunks/index.68735LiX.js` `DEFAULT_TIMEOUT = 6e4`）；`createRuntimeRpc`
 *    （`rpc.C3q9uwRX.js`）把 `...options` 展開在最後，⛔ 但 `workers/forks.js` 的
 *    `createForksRpcOptions(v8)` 只給 `serialize/deserialize/post/on` ⇒ **沒有任何設定能拉長它**。
 *  · 那一次呼叫只會在「`@vitest/runner` 的 10ms debounce 計時器**有機會觸發**」之後才送出，
 *    而計時器要一次**真的 macrotask 轉圈**（真 I/O 的 `await`）才會觸發。
 *    ⇒ ⭐ 判準：**只有「真 I/O `await` → 緊接 > 60s 同步區段」這個形狀會中**：
 *      RPC 已送出、主行程的回覆躺在 pipe 裡、同步區段結束時 timers phase 先於 poll phase
 *      ⇒ worker 自己的 60s 計時器先觸發 ⇒ `[vitest-worker]: Timeout calling "onTaskUpdate"`
 *      ⇒ 那一檔零裁決、零失敗、job 紅（run 33976263791 attempt 1）。
 *    ⇒ 整檔零 `await` 的同步模擬（settlement / royale / roundHistory / arenaRotation / match，
 *      CI 上 290–409 秒）**結構上中不了**：attempt 1 在 11.6× 超額訂閱下它們全部 ✓。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這個 shard 在 vitest 2.1.9 是什麼（`resolveConfig.rBxzbVsl.js` `createForksPool`）
 * ─────────────────────────────────────────────────────────────────────────────
 *  · 整個 forks pool 是**一顆** Tinypool，大小 = **根設定**的 `maxForks`（`vitest.config.ts`）
 *    ⇒ ⛔ 逐 project 的 `maxForks` 不會被讀；能讀的是 `poolOptions.forks.singleFork`。
 *  · `singleFork` 的 project **等所有 multi-fork 檔跑完之後**才跑、`pool.recycleWorkers()`
 *    之後在**一個**子行程裡逐檔序跑（逐檔仍 `resetModules`，isolate 不變）。
 *    ⇒ 它們的同步區段跑在**這一包沒有任何其他 fork 在搶核**的時候 —— 這就是「自己的 pool」。
 *  · ⚠️ vite 的 `mergeConfig` 把陣列**串接**（`[].concat(existing, value)`）⇒ 用 `extends`
 *    ⛔ 縮不了 `include`；所以這裡是 `import base` 再展開，`root` 明寫（`--root` 從 repo 根跑也一樣）。
 *
 * ⚠️ 代價（誠實）：shard 是**序跑的尾巴** —— 本機 uncontended 約 replay 25s ＋ analytics 12s。
 *   ⇒ 只收「會中的形狀」，⛔ 不收「很慢但同步」的檔（那些放進來只會拉長尾巴，⛔ 治不了任何東西）。
 *   加一支的判準：它的某個 hook/test 有真 I/O `await`，而其後同一段同步模擬在負載下可能 > 60s。
 *
 * 🔀 開關：`GGD_VITEST_SIM_SHARD=0` ⇒ 單一 project（＝ 2026-09-06 之前的行為，一行回頭）。
 * 守衛：`src/vitestSimShard.test.ts`（存在性 ＋ 分割關係 ＋ singleFork ＋ 開關）。
 */
export const SIM_SHARD_FILES: readonly string[] = [
  // CI attempt 2（綠）513,034 ms；單條 80–93 s；`await MatchRecorder.open` → 同步錄影 → `await finish`
  // → `await ReplayPlayer.open` → 同步重播：**兩段**都是「await 後緊接同步」。
  "src/replay/replay.test.ts",
  // attempt 1 唯一沒裁決的那一檔（918−906−2 = 10 tests）：`beforeAll` `await mkdtemp` →
  // `await Recorder.open` → 同步模擬 12 隻 bot 整場。本機 11.7 s、CI attempt 2 108,772 ms。
  "src/analytics/analytics.test.ts",
];

export const SIM_SHARD_ENABLED = process.env.GGD_VITEST_SIM_SHARD !== "0";

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineWorkspace(
  SIM_SHARD_ENABLED
    ? [
        {
          ...base,
          root: ROOT,
          test: {
            ...base.test,
            name: "unit",
            // ⚠️ `exclude` 一旦給了就**取代**預設 ⇒ 要把 `configDefaults.exclude`（node_modules…）帶著。
            exclude: [...configDefaults.exclude, ...SIM_SHARD_FILES],
          },
        },
        {
          ...base,
          root: ROOT,
          test: {
            ...base.test,
            name: "sim",
            include: [...SIM_SHARD_FILES],
            poolOptions: { forks: { ...base.test?.poolOptions?.forks, singleFork: true } },
          },
        },
      ]
    : ["./vitest.config.ts"],
);
