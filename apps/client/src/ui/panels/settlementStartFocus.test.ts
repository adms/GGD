// @vitest-environment jsdom
/**
 * settlementStartFocus — 結算畫面掛上來的那一刻，手把的**起始焦點**在「返回大廳」
 * （GH#528，#502 稽核逐字：「結算畫面沒有起始焦點：第一次推搖桿落在最上最左」）。
 *
 * `PadFocusNav` 在沒有任何元素持有 `PAD_FOCUS_ATTR` 時走 `initialFocusIndex`
 * —— 純幾何的「最上、再最左」。在結算卡上那是右上角的收合鍵，⛔ 不是這個畫面
 * 唯一的出口，所以純手把玩家要盲推好幾次才離得開。
 *
 * ⚠️ jsdom + `createRoot`，⛔ 不是 `renderToStaticMarkup`：起始焦點是一個
 * `useEffect`，而 SSR **不執行 effect** —— 一條 SSR 斷言在整段效果被刪掉之後
 * 照樣是綠的（失敗形態 ③）。掛的是出貨的 `<MatchEndPanel/>` 本人。
 * ⚠️ 夾具是**輸家**的結算：贏家的卡片會被烤雞煙火扣住，那段時間整片 wash 是
 * `pointer-events: none`，起始焦點刻意等到卡片真的出現才放。
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

/** ⚠️ winnerTeam 1，本地座位在隊伍 0 ⇒ 敗仗 ⇒ 沒有煙火扣住卡片。 */
function settlementFixture(): MatchSettlement {
  const of = (seatId: number, teamId: number, rank: number): MatchSettlement["perPlayer"][number] => ({
    seatId, accountId: `acc-${seatId}`, champ: "godie-ogrh", teamId,
    role: "fighter", grade: "B", rank, stats: createMatchStats(),
  });
  return { matchId: "m-start-focus", winnerTeam: 1, perPlayer: [of(0, 0, 2), of(1, 1, 1)] };
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
    // 只做 DOM focus 不夠：`focusedInScope()` 只認得這個屬性，沒有它第一次推
    // 搖桿仍然掉回幾何起點（第一·五守則的「說了但不會發生」）。
    expect(active?.hasAttribute(PAD_FOCUS_ATTR), "少了 pad 光暈屬性").toBe(true);
    // 而幾何起點**確實**不是出口 —— 這一行說明上面那兩條為什麼非做不可。
    expect(host.querySelector("button")?.textContent ?? "").not.toContain("返回大廳");
  });
});
