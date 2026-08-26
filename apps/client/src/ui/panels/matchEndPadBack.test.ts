/**
 * GH#511 —— 結算卡的 B 鍵是**契約**，不是文案的巧合。
 *
 * ⛔ NOT `grep "data-pad-back"` over MatchEndPanel.tsx（失敗形態⑥：掃原始碼字串
 * 代替行為）。這裡把出貨的 `MatchEndCollapseToggle` 真的渲染出來，讀**最終 markup**，
 * 然後把那份 markup 的標籤餵進**出貨的** `BACK_ALLOW_RE`／`BACK_VETO_RE` ——
 * 也就是 `findBackControl` 真正會走的那兩條規則（padFocusNav.ts:249-251）。
 *
 * ⭐ 兩個狀態一起驗，因為缺陷正是「某一個狀態上沒有」：收合之後標籤變成
 * 「▾ 展開戰績」，而 allow-list 有「收起」**沒有**「收到」也沒有「展開」
 * ⇒ 少了顯式契約，B 在任一狀態都是死鍵。
 *
 * ⭐ 第二條斷言是這張票的**根因**：它證明標籤掃描這條退路**接不住**這顆按鈕，
 * 所以 `data-pad-back` ⛔ 不是可有可無的裝飾。它同時擋住「有人日後把
 * `data-pad-back` 拿掉、改去擴 `BACK_ALLOW_RE` 猜字面」那條路。
 *
 * 突變（2026-08-26）：拿掉那行 `data-pad-back` → 本檔紅並指名 collapsed=false。
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchEndCollapseToggle } from "./MatchEndPanel";
import { BACK_ALLOW_RE, BACK_VETO_RE } from "../../input/padFocusNav";

const markup = (collapsed: boolean): string =>
  renderToStaticMarkup(
    createElement(MatchEndCollapseToggle, { collapsed, onToggle: () => undefined }),
  );

describe("結算卡收合鍵 · B 鍵", () => {
  it("展開與收合兩個狀態都宣告了 data-pad-back", () => {
    for (const collapsed of [false, true]) {
      expect(markup(collapsed), `collapsed=${collapsed}`).toContain("data-pad-back");
    }
  });

  it("⛔ 標籤掃描接不住它 —— 所以顯式契約是唯一的路", () => {
    for (const collapsed of [false, true]) {
      const label = /aria-label="([^"]*)"/.exec(markup(collapsed))?.[1] ?? "";
      expect(label, `collapsed=${collapsed}`).not.toBe("");
      expect(BACK_ALLOW_RE.test(label), `${label} 不該被 allow-list 撿到`).toBe(false);
      expect(BACK_VETO_RE.test(label), `${label} 不該被 veto`).toBe(false);
    }
  });
});
