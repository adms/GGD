// ⏲️ GH#1257 夾具（⛔ 不是測試）：同步燒 CPU、跑得比判死門檻還久 —— ⛔ 不可以被殺。
// 對應 `catalogMatrix.test.ts` 那條健康但 5 分 46 秒沒有任何新輸出的測試（誤殺方向的證據）。
import { it } from "vitest";

it("慢但健康", () => {
  const until = performance.now() + Number(process.env.GGD_WATCHDOG_FIXTURE_BURN_MS);
  let spins = 0;
  while (performance.now() < until) spins++;
  if (spins === 0) throw new Error("沒有燒到 CPU —— 夾具沒拿到 GGD_WATCHDOG_FIXTURE_BURN_MS");
});
