/**
 * GH#842 / #868 —— 三秒碼表的 **rollback 開關**（`vfxRefireClock`）。
 *
 * ⭐ 這一條問的**不是**「修好了沒」（那是 `hardCapRefire.test.ts` 的事），
 * 而是 owner 常設指令的那一半：
 *
 * > 「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」（2026-08-23）
 *
 * ⇒ 判準是 **「翻過去，舊行為真的回來」**。⛔ 一個沒有人讀的常數不是開關，是散文
 * （第三守則），而 `review:register` 的登記閘正是為此拒絕過這一批。
 *
 * ⚠️ 這裡刻意**測開關關掉的那一邊**（第〇·六守則的預設是「⛔ 不測舊行為」）——
 * 因為這一批的成果**就是那個開關本身**：不驗「翻過去會怎樣」，就等於沒驗它。
 */
import { describe, it, expect, afterEach } from "vitest";
import { markVfxManaged, noteVfxRefired, sweepVfxHardCap } from "./vfxHardCap";
import {
  DEFAULT_VFX_REFIRE_CLOCK,
  resetVfxRefireClockCache,
  resolveVfxRefireClock,
  VFX_REFIRE_CLOCK_GLOBAL,
} from "./vfxCleanupPolicy";

/** 一顆池化 emitter 的樣子：重新點燃時 ⛔ 不排空 ⇒ `isAlive()` 一直是 true。 */
function fakePs(name: string): { name: string; stopped: number } {
  const ps = {
    name,
    stopped: 0,
    reset(): void {},
    stop(): void {
      ps.stopped++;
    },
    isAlive: () => true,
    isStarted: () => true,
    isStopping: () => false,
  };
  return ps as never;
}

/** 連續戰鬥 5 秒、每 0.5 秒再點燃一次 —— 回傳「正在播的那一發被砍了幾次」。 */
function sustainedCombatKills(): number {
  const ps = fakePs("vfx-preset-hit");
  markVfxManaged(ps);
  const scene = { particleSystems: [ps as never], transformNodes: [] };
  sweepVfxHardCap(scene as never, 0, { maxLifeSec: 3, scope: "managed" });
  for (let t = 0.5; t <= 5; t += 0.5) {
    noteVfxRefired(ps);
    sweepVfxHardCap(scene as never, t, { maxLifeSec: 3, scope: "managed" });
  }
  return ps.stopped;
}

const g = globalThis as unknown as Record<string, unknown>;

describe("GH#842 rollback 開關：三秒碼表的主詞可以一鍵翻回「這顆 emitter 活了多久」", () => {
  afterEach(() => {
    delete g[VFX_REFIRE_CLOCK_GLOBAL];
    resetVfxRefireClockCache();
  });

  it("⭐ 翻到 `emitter` ⇒ **舊行為真的回來**（連續戰鬥中正在播的那一發又被砍）", () => {
    // 出貨檔位：打一打不會消失（＝ GH#842 修好的那一邊）
    resetVfxRefireClockCache();
    expect(sustainedCombatKills(), "出貨檔位就已經在砍 —— 修復本身壞了").toBe(0);

    // 🔁 owner 一鍵翻回去（runtime 通道，⛔ 不必重建 client）
    g[VFX_REFIRE_CLOCK_GLOBAL] = "emitter";
    resetVfxRefireClockCache();
    expect(
      sustainedCombatKills(),
      "⛔ 開關翻過去而行為沒變 —— 那它就是一個沒有人讀的常數，⛔ 不是 rollback 開關",
    ).toBeGreaterThan(0);
  });

  it("⭐ 打錯的旗標退回**出貨檔位**（⛔ 不可以靜默把修好的東西關掉）", () => {
    expect(resolveVfxRefireClock("emiter")).toBe(DEFAULT_VFX_REFIRE_CLOCK);
    expect(resolveVfxRefireClock(undefined)).toBe(DEFAULT_VFX_REFIRE_CLOCK);
  });
});
