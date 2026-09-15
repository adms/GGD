/**
 * ⏲️ GH#1257 —— vitest **預設**經過看門狗：主行程啟動時把自己的 pid 交給
 * `scripts/watchdog.sh --attach`（判死準則的**唯一**住處），⛔ 這裡不判死。
 *
 * ⭐ 為什麼住 globalSetup：它在主行程裡跑、拿得到 `config.watch`，
 *   而且 CLI 旗標蓋不掉它（reporter 會被 `--reporter` 蓋掉，這裡不會）。
 *   ⇒ `npx vitest run`、`pnpm --dir <包> test`、`pnpm test`、背景全套 —— 載入哪一份設定都一樣。
 *
 * 開火時看門狗送 SIGUSR2 ⇒ 這裡 `process.exit(125)`：
 *   ⭐ 125 讓 `npx`／`pnpm` 回報的離開碼與「測試紅」的 1 分得開（與 watchdog.sh 包指令模式的 idle 碼相同）。
 *
 * 🔙 開關（環境變數 —— 只有作者／CI 會轉，⛔ 不進後台）：
 *   GGD_VITEST_WATCHDOG_OFF=1          整隻不掛（rollback）
 *   GGD_VITEST_WATCHDOG_RECORD_ONLY=1  看門狗只印不殺（`ship.mjs` 替子行程設：它自己有逐 suite 看門狗）
 * ⚠️ watch 模式不掛：等檔案變動時本來就是 CPU≈0，⛔ 那不是卡死。
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pendingFileFor } from "./pendingReporter.mjs";

const WATCHDOG = fileURLToPath(new URL("../../scripts/watchdog.sh", import.meta.url));

export default function setup({ config }) {
  if (config.watch || process.env.GGD_VITEST_WATCHDOG_OFF === "1" || process.platform === "win32") return;
  // workspace（apps/game-server）每個 project 各跑一次 globalSetup ⇒ 一個主行程只掛一隻。
  // ⚠️ 比對 pid 而不是「有沒有設」：子行程會繼承 env，而測試裡再起一個 vitest 時它要有自己的一隻。
  if (process.env.GGD_VITEST_WATCHDOG_PID === String(process.pid)) return;
  process.env.GGD_VITEST_WATCHDOG_PID = String(process.pid);

  const pending = pendingFileFor(process.pid);
  process.on("SIGUSR2", () => process.exit(125));
  // detached ⇒ 自成一個 process group：收工時整組帶走（含它正在跑的 sleep／ps），
  // ⛔ 不讓一個孫行程握著 stdout 讓 `| tee`、`spawnSync` 多等。
  const dog = spawn("bash", [WATCHDOG, "--attach", String(process.pid), "--pending-file", pending], {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  dog.unref();
  return () => {
    try {
      process.kill(-dog.pid, "SIGTERM");
    } catch {
      // 已經自己走了
    }
    rmSync(pending, { force: true });
  };
}
