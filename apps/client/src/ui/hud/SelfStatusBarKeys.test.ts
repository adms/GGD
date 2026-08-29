/**
 * @vitest-environment jsdom
 *
 * 兩層同名狀態 ⇒ 兩顆圖示，兩把不同的 key（GH#837）。
 *
 * ⭐⭐ 2026-08-29 —— 這條守衛改成**真的把它掛進 React 調和器**，因為票的第一條
 * AC 逐字是「零警告」，⛔ 而「零警告」是 React **自己**才說得出口的話。
 *
 * ⚠️ 在此之前它讀的是 view 交給 React 的 `.key` 陣列。那證明得了「key 不撞」，
 * ⛔ 證明不了「React 不會叫」——⭐ 而票是被那句話卡著的（上一輪因此只能回
 * 「鏈路已接上，⛔ 未驗收」）。
 *
 * ⛔⛔ **`renderToStaticMarkup` 在這一題上是瞎的** —— 這是量到的，⛔ 不是推測：
 * 拿一對**手工做的重複 key** 餵給它，`console.error` 被呼叫 **0 次**。
 * ⇒ 拿 SSR 寫「零警告」會得到一條**對的與壞的實作都會綠**的守衛（失敗形態④，
 * 天譴那次的 d 洞：一把在特定方向上是瞎的尺）。所以這裡是 jsdom ＋
 * `createRoot`＋`flushSync`：那才是瀏覽器裡真的印出那串警告的同一條路。
 *
 * ⭐ 兩個方向都校準過（`calibrate`）：已知**壞**的量得到、已知**好**的量不到。
 *
 * ── 突變（2026-08-29）：`SelfStatusBar.tsx` 的 `key={keys[i]}` 改回 `key={r.id}`
 *    → 本檔第一條紅，訊息逐字帶回 React 的
 *    `Encountered two children with the same key`。改回即綠。
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

/** 真的掛進 DOM，回傳 React 印出的**重複 key** 警告與畫出來的圖示數。 */
function mount(el: ReactNode): { dupKeyWarnings: string[]; plates: number } {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.appendChild(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  flushSync(() => root.render(el));
  // ⛔ 只留重複 key 那一種：`act(...)` 是測試腳手架的噪音，⛔ 不是產品警告。
  const dupKeyWarnings = spy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => m.includes("two children with the same key"));
  const plates = host.querySelectorAll("[data-status-id]").length;
  spy.mockRestore();
  root.unmount();
  host.remove();
  return { dupKeyWarnings, plates };
}

describe("SelfStatusBar 的 React key", () => {
  it("⭐ 兩層同名狀態：零重複-key 警告，而且兩顆圖示都在（AC1）", () => {
    // 兩個來源各給一層 30% 減速 —— 線上真的會送兩筆同 id（#819 驗收時量到）。
    const r = mount(
      createElement(SelfStatusBarView, {
        rows: [row("slow30", 4), row("slow30", 9), row("burnstun", 2)],
      }),
    );
    expect(r.dupKeyWarnings, `React 仍在叫：${r.dupKeyWarnings[0] ?? ""}`).toEqual([]);
    expect(r.plates, "少畫了一顆 —— 兩層 slow 只剩一顆圖示").toBe(3);
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
