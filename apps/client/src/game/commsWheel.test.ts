/**
 * GH#731 —— 通訊輪盤。⭐ 一個機制解 5 格 `dormant: "no-signal"` 的語音。
 *
 * MUTATION LOG：`keyUp` 裡的 `this.cfg.entries[idx]` 改成永遠回 null → ①紅。
 */
import { describe, it, expect } from "vitest";
import { CommsWheelState, wheelIndexAt, type CommsWheelConfig } from "./commsWheel";

const CFG: CommsWheelConfig = {
  enabled: true,
  holdKey: "KeyV",
  entries: [
    { id: "a", zh: "撤退", voiceCategory: "retreat" },
    { id: "b", zh: "小心", voiceCategory: "watch" },
    { id: "c", zh: "好", voiceCategory: "love" },
    { id: "d", zh: "？", voiceCategory: "puzzled" },
  ],
};

describe("GH#731 通訊輪盤", () => {
  it("★ ⭐ 按住 → 指向 → 放開 ⇒ 回傳那一格（⛔ 在此之前那 5 類永遠沒有訊號）", () => {
    const w = new CommsWheelState(CFG);
    expect(w.keyDown("KeyV", { x: 100, y: 100 })).toBe(true);
    w.pointerMove(100, 20); // 正上方
    const got = w.keyUp("KeyV");
    expect(got?.voiceCategory, "⛔ 輪盤沒有送出任何東西").toBe("retreat");
  });

  it("★ ⭐ **死區＝取消** —— ⛔ 否則一按開就等於喊了第 0 格", () => {
    const w = new CommsWheelState(CFG);
    w.keyDown("KeyV", { x: 100, y: 100 });
    w.pointerMove(102, 101); // 幾乎沒動
    expect(w.keyUp("KeyV"), "⛔ 一打開就送出了").toBeNull();
  });

  it("⭐ 正上方**跨在第 0 格中央**，⛔ 不是兩格的邊界", () => {
    // 4 格 ⇒ 每格 90°。正上方(0°) 要落在 0，右(90°) 落在 1。
    expect(wheelIndexAt(0, -80, 4)).toBe(0);
    expect(wheelIndexAt(80, 0, 4)).toBe(1);
    expect(wheelIndexAt(0, 80, 4)).toBe(2);
    expect(wheelIndexAt(-80, 0, 4)).toBe(3);
  });

  it("⭐ 關掉總開關 ⇒ 打不開（一鍵 rollback）", () => {
    const w = new CommsWheelState({ ...CFG, enabled: false });
    expect(w.keyDown("KeyV", { x: 0, y: 0 })).toBe(false);
    expect(w.isOpen).toBe(false);
  });

  it("⭐ 比對的是 `code` ⛔ 不是 `key`（輸入法會改寫 key）", () => {
    const w = new CommsWheelState(CFG);
    expect(w.keyDown("v", { x: 0, y: 0 }), "⛔ 拿 key 在比對").toBe(false);
  });
});
