/**
 * ⭐⭐ GH#900 —— 「太多亮光束特效 太誇張了 **變成全白戰鬥**」（owner 2026-09-01）。
 *
 * ── ⚠️ 這條守衛的形狀是被票文指定的 ──────────────────────────────────────
 * > 「⭐ **這一族缺陷長成「看不見」，而量尺在那個方向上常常是瞎的** ——
 * >   CLAUDE.md 記過：`calibrate()` 只驗「應該多」那一邊會讓結論作廢。
 * >   ⇒ 量尺要**兩個方向都驗**：已知會過曝的場景量得到過曝 **且**
 * >     已知正常的場景量不到。」
 *
 * ⇒ ⭐ 每一條都跑**兩邊**，⛔ 不是只驗「開啟時有變」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `additiveGain` 的 `liveThisFrame += 1` 拿掉      → ① 紅（永遠不超支）
 *   · `beginAdditiveFrame` 的 `liveThisFrame = 0` 拿掉 → ③ 紅（第二 frame 一開始就超支）
 *   · `if (!isAdditive) return 1` 拿掉                  → ④ 紅（alpha 也被扣預算）
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setAdditiveBudget, beginAdditiveFrame, additiveGain, additiveLiveCount, additiveBudget,
} from "./additiveBudget";

beforeEach(() => {
  setAdditiveBudget(0, 1);
  beginAdditiveFrame();
});

describe("GH#900 additive 預算", () => {
  it("★ ① 上限之內全亮、超過之後減光（⭐ 兩個方向都量）", () => {
    setAdditiveBudget(3, 0.35);
    beginAdditiveFrame();
    // ⭐ 方向 A：已知「沒有超支」的場景 ⇒ 量不到減光
    expect([additiveGain(true), additiveGain(true), additiveGain(true)], "⛔ 上限之內就不該減光").toEqual([1, 1, 1]);
    // ⭐ 方向 B：已知「超支」的場景 ⇒ 量得到減光
    expect(additiveGain(true), "⛔ 第 4 發超過上限了，而它照全亮播 ⇒ 畫面照樣被推白").toBe(0.35);
    expect(additiveGain(true)).toBe(0.35);
  });

  it("★ ② `0` 是**不限**（⛔ 一鍵 rollback 到 2026-09-01 之前）", () => {
    setAdditiveBudget(0, 0.35);
    beginAdditiveFrame();
    for (let i = 0; i < 50; i++) {
      expect(additiveGain(true), `⛔ 上限 0 應該是不限，而第 ${i + 1} 發被減光了`).toBe(1);
    }
  });

  it("★ ③ 預算**每 frame 歸零**（⛔ 少了它第二場戰鬥一開始就全暗）", () => {
    setAdditiveBudget(2, 0);
    beginAdditiveFrame();
    additiveGain(true); additiveGain(true); additiveGain(true);
    expect(additiveLiveCount()).toBe(3);
    beginAdditiveFrame();
    expect(additiveLiveCount(), "⛔ 新的一 frame 而計數沒有歸零").toBe(0);
    expect(additiveGain(true), "⛔ 新的一 frame 第一發就被當成超支").toBe(1);
  });

  it("★ ④ **只有 additive 佔預算**（⛔ alpha/modulate 在算術上不會把畫面推向白）", () => {
    setAdditiveBudget(1, 0);
    beginAdditiveFrame();
    // ⭐ 方向 A：非 additive 不佔格子
    for (let i = 0; i < 10; i++) expect(additiveGain(false), "⛔ 非 additive 被扣了預算").toBe(1);
    expect(additiveLiveCount(), "⛔ 非 additive 讓計數往前跑了").toBe(0);
    // ⭐ 方向 B：additive 佔
    expect(additiveGain(true)).toBe(1);
    expect(additiveGain(true), "⛔ 第 2 發 additive 沒有被擋").toBe(0);
  });

  it("⭐ ⑤ 亮度 `1` ＝ 關掉這個機制（另一個 rollback 出口）", () => {
    setAdditiveBudget(1, 1);
    beginAdditiveFrame();
    additiveGain(true);
    expect(additiveGain(true), "⛔ 亮度設 1 就該是「完全不管」").toBe(1);
    expect(additiveBudget()).toEqual({ max: 1, overflow: 1 });
  });
});
