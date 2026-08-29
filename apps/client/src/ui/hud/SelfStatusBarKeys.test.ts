/**
 * @vitest-environment jsdom
 *
 * 兩層同名狀態 ⇒ 兩顆圖示，兩把不同的 key（GH#837）。
 *
 * ⛔⛔ 這一題上**有兩把尺是瞎的**，兩把都是量到的，⛔ 不是推測：
 * ① `renderToStaticMarkup` 餵手工重複 key ⇒ `console.error` **0 次** ⇒ 拿 SSR
 *    寫「零警告」＝對的與壞的實作都會綠。⇒ 改用 jsdom＋`createRoot`＋`flushSync`
 *    （瀏覽器真的印出那串警告的同一條路），並用「自證」那條把尺自己驗一遍。
 * ② ⭐ **「畫面上有幾顆圖示」要在**更新之後**數才有意義** —— 兩次都量過：
 *    · **首次掛載**：突變體照樣畫 3 顆 ⇒ 這個位置的 `plates` 是瞎的（把斷言
 *      順序對調驗過，紅的只有警告那一條）。React 不會少畫 child。
 *    · ⭐ **更新之後**：突變體畫出 **5 顆**（而 rows 只有 4 列）—— React 把撞
 *      key 的舊節點留在 DOM 裡（警告原文的 "duplicated" 那一半）
 *      ⇒ ⛔ **玩家看到一顆不存在的減速圖示**。那才是這張票的驗收標準。
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { SelfStatusRow } from "./selfStatusModel";
import { SelfStatusBarView, selfStatusRowKeys } from "./SelfStatusBar";

const row = (id: string, secondsLeft: number): SelfStatusRow => ({
  id,
  label: id,
  polarity: "debuff",
  secondsLeft,
  disabling: false,
});

const view = (rows: SelfStatusRow[]): ReactNode => createElement(SelfStatusBarView, { rows });

/** 掛進真 DOM；給 `next` 就再走一次**更新**，`survivors` 數同一顆節點活過幾個。 */
function mount(el: ReactNode, next?: ReactNode): { dupKeyWarnings: string[]; plates: number; survivors: number } {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.appendChild(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  flushSync(() => root.render(el));
  const before = [...host.querySelectorAll("[data-status-id]")];
  if (next) flushSync(() => root.render(next));
  const after = [...host.querySelectorAll("[data-status-id]")];
  // ⛔ 只留重複 key 那一種：`act(...)` 是測試腳手架的噪音，⛔ 不是產品警告。
  const dupKeyWarnings = spy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => m.includes("two children with the same key"));
  const survivors = before.filter((n) => after.includes(n)).length;
  spy.mockRestore();
  root.unmount();
  host.remove();
  return { dupKeyWarnings, plates: after.length, survivors };
}

describe("SelfStatusBar 的 React key", () => {
  it("⭐ 兩層同名狀態：兩顆圖示各自活過一次更新，且零重複-key 警告（AC1）", () => {
    // 兩個來源各給一層 30% 減速 —— 線上真的會送兩筆同 id（#819 驗收時量到）。
    const twoLayers = [row("slow30", 4), row("slow30", 9), row("burnstun", 2)];
    // 一個暈眩進場：`selfStatusRows()` 把 disabling 排最前 ⇒ 整排位置位移，
    // ⭐ 那才是 React 走 map 路徑、讓撞 key 的後者覆蓋前者的那一刻。
    const stunArrives = [
      { ...row("stun", 2), disabling: true }, row("slow30", 3), row("slow30", 8), row("burnstun", 1),
    ];
    const r = mount(view(twoLayers), view(stunArrives));
    // ⭐ 承重的那一條：更新後多一顆 = 玩家身上掛著一個他沒有的狀態。
    expect(r.plates, "更新後畫面上的圖示數 ≠ rows 列數 —— 有幽靈圖示").toBe(4);
    expect(r.survivors, "兩層的圖示都該原地留著,⛔ 不是被銷毀重建").toBe(3);
    expect(r.dupKeyWarnings, `React 仍在叫：${r.dupKeyWarnings[0] ?? ""}`).toEqual([]);
  });

  it("⭐ 這把尺的自證：同一條路餵手工重複 key ⇒ 它**真的**會叫", () => {
    const bad = mount(
      createElement(
        "div",
        null,
        createElement("span", { key: "slow30", "data-status-id": "slow30" }, "a"),
        createElement("span", { key: "slow30", "data-status-id": "slow30" }, "b"),
      ),
    );
    expect(bad.dupKeyWarnings.length, "尺是瞎的 —— 上面那條綠了不代表任何事").toBe(1);
  });

  it("每個狀態各一層時 key 就是裸的 id —— ⛔ 不是位置,插一列不會整批重掛", () => {
    expect(selfStatusRowKeys([row("burnstun", 2), row("slow30", 4)])).toEqual(["burnstun", "slow30"]);
    // 上面插一列 ⇒ slow30 的 key 不動（若用陣列 index 就會從 "…#1" 變 "…#2"）。
    expect(selfStatusRowKeys([row("root", 1), row("burnstun", 2), row("slow30", 4)])).toContain("slow30");
  });
});
