/**
 * GH#838 M4 —— 動畫脈衝接縫的薄守衛（體驗層：一條會紅的線就夠，⛔ 不開對抗輪）。
 * 突變：把 `views.getChampionView(id)?.pulse(...)` 拿掉 ⇒ ① 紅。
 */
import { describe, it, expect } from "vitest";
import { makeAnimPulseBridge, type AnimPulseTarget } from "./appBridges";

describe("animPulseBridge", () => {
  it("① 打到那個 id 的 view，帶著時鐘與剪輯窗", () => {
    const seen: unknown[] = [];
    const view: AnimPulseTarget = { pulse: (k, t, o) => seen.push([k, t, o]) };
    const bridge = makeAnimPulseBridge({ getChampionView: (id) => (id === 7 ? view : undefined) }, () => 1234);
    bridge(7, "hurt", { clipWindowMs: 900 });
    expect(seen).toEqual([["hurt", 1234, { clipWindowMs: 900 }]]);
  });

  it("② view 不在（實體剛離場）⇒ 安靜跳過，⛔ 不擲例外帶走整批事件", () => {
    const bridge = makeAnimPulseBridge({ getChampionView: () => undefined }, () => 0);
    expect(() => bridge(99, "cast")).not.toThrow();
  });
});
