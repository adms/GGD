// ⏲️ GH#1257 夾具（⛔ 不是測試，只由 `packages/shared/src/ops/vitestIdleWatchdog.test.ts` 指名跑）：
// worker **同步**阻塞在 0% CPU —— testTimeout 的計時器插不進去，09-13 那 4 小時 48 分就是這個形狀。
// 先生一個孫行程、把兩個 pid 寫出去，守衛才驗得到「整棵樹都被收掉」。
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { it } from "vitest";

it("閒置卡死", () => {
  const grandchild = spawn("sleep", ["600"], { stdio: "ignore" });
  writeFileSync(String(process.env.GGD_WATCHDOG_FIXTURE_PIDS), `${process.pid} ${grandchild.pid}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
