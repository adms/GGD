// @vitest-environment jsdom
/**
 * settlementStartFocus — 結算畫面掛上來的那一刻，手把的**起始焦點**在「返回大廳」。
 *
 * ── 這條守衛存在的理由（GH#528 / #502 稽核） ─────────────────────────────────
 * `PadFocusNav` 在沒有任何元素持有 `PAD_FOCUS_ATTR` 時，第一次推搖桿走的是
 * `initialFocusIndex` —— 純幾何的「最上、再最左」。在結算卡上那是右上角的
 * 收合鍵，⛔ 不是這個畫面唯一的出口，所以純手把玩家要盲推好幾次才離得開。
 *
 * ── 為什麼是 jsdom + createRoot，不是 renderToStaticMarkup ────────────────────
 * 起始焦點是一個 `useEffect`，而 SSR **不執行 effect**：一條 SSR 斷言在整段
 * effect 被刪掉之後照樣是綠的（失敗形態 ③）。所以這裡掛的是**出貨的**
 * `<MatchEndPanel/>` 本人，讀的是真的 `document.activeElement`。
 * 前例：`ui/platform/valhalla/ValhallaPanelMount.test.ts`（`vite.config.ts`
 * 一個字都沒動）。
 *
 * ⚠️ 夾具用**輸家**的結算（`winnerTeam` 不是本地隊伍）：贏家的卡片會被烤雞煙火
 * 扣住（`matchCardHeld`），而那段時間整片 wash 是 `pointer-events: none`，
 * 起始焦點刻意等到卡片真的出現才放（見 MatchEndPanel 的 `exitRef` 效果）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { PAD_FOCUS_ATTR } from "../focusGlow";
import { MatchEndPanel } from "./MatchEndPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function settlementFixture(): MatchSettlement {
  return {
    matchId: "m-start-focus",
    // ⚠️ 1，不是 0 —— 本地座位在隊伍 0，所以這是一場**敗仗**：沒有煙火扣住卡片。
    winnerTeam: 1,
    perPlayer: [
      { seatId: 0, accountId: "acc-0", champ: "godie-ogrh", teamId: 0, role: "fighter", grade: "B", rank: 2, stats: createMatchStats() },
      { seatId: 1, accountId: "acc-1", champ: "godie-ucrl", teamId: 1, role: "mage", grade: "A", rank: 1, stats: createMatchStats() },
    ],
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetHudStore();
});

describe("結算畫面的手把起始焦點 (GH#528)", () => {
  it("掛上來就把焦點與光暈放在「返回大廳」，⛔ 不是最上最左那一顆", () => {
    hudStore.setState({
      connected: true,
      phase: "matchEnd",
      localSeatId: 0,
      settlement: settlementFixture(),
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(MatchEndPanel)));

    const active = document.activeElement as HTMLElement | null;
    // ⚠️ 先問 tagName：沒有人聚焦時 `document.activeElement` 是 `<body>`，而
    // body 的 textContent 含著整張卡的字 —— 只寫 `toContain("返回大廳")` 的話，
    // 效果整段刪掉照樣是綠的（量到的：第一版就是這樣）。
    expect(active?.tagName, "沒有任何按鈕被聚焦").toBe("BUTTON");
    expect(active?.textContent?.trim(), "起始焦點不在出口上").toBe("返回大廳");
    // 只做 DOM focus 不夠：`PadFocusNav.focusedInScope()` 只認得這個屬性，
    // 沒有它，第一次推搖桿仍然掉回幾何起點（第一·五守則的「說了但不會發生」）。
    expect(active?.hasAttribute(PAD_FOCUS_ATTR), "少了 pad 光暈屬性").toBe(true);

    // 而幾何起點**確實**不是出口 —— 這一行說明上面那條為什麼非做不可。
    const firstBtn = host.querySelector<HTMLElement>("button");
    expect(firstBtn?.textContent ?? "").not.toContain("返回大廳");
  });
});
