/**
 * GH#514 — 大廳側欄的每一塊捲動區都有一個手把站得上去的落點。
 *
 * ⛔ NOT `grep "data-pad-focusable"` —— 那是第二守則失敗形態⑥（掃原始碼字串代替
 * 行為），而且在這裡特別沒用：屬性可以寫在一個永遠不會被畫出來的分支上，也可以
 * 寫在一個**不會轉發未知 props** 的元件上（`<Panel>` 只轉發 `data-*` 與
 * onMouseEnter/Leave，`<Btn>` 什麼都不轉發）而被靜默丟掉。所以這裡真的把面板
 * 渲染出來（`react-dom/server`；本包的 vitest 是 `environment: "node"`），
 * 讀的是**最終 markup**。
 *
 * ⭐ 斷言不是「markup 裡有那個字串」，而是「**同一個標籤**上同時有
 * `data-pad-focusable` · `tabindex="-1"` · `overflow-y:auto`」——
 * 也就是落點真的落在**會捲動的那個框**上。落在別的地方 = `scrollTargetFor`
 * 從焦點往上找不到可捲祖先 = 手把照樣捲不動（失敗形態④：斷言方向跟缺陷無關）。
 *
 * ⚠️ 四個面板刻意用**空清單／載入中**的狀態渲染 —— 那是 SSR 拿得到的狀態，
 * 也正好是「一個可聚焦子元素都沒有」最嚴重的狀態。落點掛在容器上，所以它在。
 *
 * Mutation（2026-08-22，M1）：把 `{...padFocusLanding()}` 從 NemesisPanel 的捲動框
 * 拿掉 → 這一條紅，訊息指名 `宿敵榜`。
 */
import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NemesisPanel } from "./NemesisPanel";
import { FriendsPanel } from "./FriendsPanel";
import { OnlinePlayersPanel } from "./OnlinePlayersPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { ValhallaDescription } from "./ValhallaPanel";

/** 一張表，五格（第零守則⑨：N 個同型 = K 個模板 + 一張表）。 */
const REGIONS: { name: string; render: () => ReactElement }[] = [
  { name: "宿敵榜", render: () => createElement(NemesisPanel) },
  { name: "好友清單", render: () => createElement(FriendsPanel) },
  { name: "線上玩家", render: () => createElement(OnlinePlayersPanel, {}) },
  { name: "排位榜", render: () => createElement(LeaderboardPanel) },
  {
    // ⚠️ 英靈殿的完整卡片只在 `advance()` 跑過之後才畫得出來，而 `advance()` 住在
    // `useEffect` 裡 ⇒ SSR 永遠只拿得到骨架。所以這一格渲染的是出貨的那個
    // 描述框元件本人（`ValhallaPanel.tsx` 匯出的），⛔ 不是一份手抄的複製品。
    name: "英靈殿描述",
    render: () =>
      createElement(ValhallaDescription, { text: "很長的故事……", maxHeight: 56 }),
  },
];

/** markup 裡有沒有**同一個標籤**同時帶著落點與捲動？ */
function hasScrollableLanding(html: string): boolean {
  for (const tag of html.match(/<[^>]+>/g) ?? []) {
    if (
      tag.includes("data-pad-focusable") &&
      tag.includes('tabindex="-1"') &&
      /overflow-y\s*:\s*auto/.test(tag)
    ) {
      return true;
    }
  }
  return false;
}

describe("GH#514 大廳捲動區的手把落點", () => {
  it("★ 五塊捲動區都在**會捲的那個框**上宣告了 data-pad-focusable + tabindex=-1", () => {
    const missing = REGIONS.filter((r) => !hasScrollableLanding(renderToStaticMarkup(r.render())));
    expect(missing.map((r) => r.name)).toEqual([]);
  });
});
