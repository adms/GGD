/**
 * 結算計分卡不該為了一隻不會飛的鳥空等 (#93 / #235 · owner 2026-08-02).
 *
 * 背景：吃雞時 `MatchEndPanel` 會把計分卡壓住 `MATCH_PANEL_HOLD_MS`（= 2340 ms），
 * 而 `render/victoryPresentation` 自己寫得很清楚，那段延遲**存在的唯一理由**就是
 * 讓那隻全螢幕的烤雞被看到。owner 2026-08-02 把煙火變成後台開關並且出貨關閉之後，
 * 如果還照 2340 ms 壓住，玩家贏下整場會盯著一個沒有煙火、也沒有分數的畫面兩秒多
 * —— 那是「關掉煙火」憑空製造出來的新缺陷，而且畫面上沒有任何錯誤訊息。
 *
 * ⚠️ 這一支渲染**出貨的那個 `<MatchEndPanel />`**（`react-dom/server`，和
 * `hud/hudSurfacePaint.test.ts` 同一條路），讀的是它真的吐出來的 markup ——
 * 不是 `matchPanelHoldMs()` 這個純函式的回傳值。只驗純函式會落在第⑤號故障
 * （被測的不是出貨的那個）：那個函式完全可以是對的，而 panel 照樣讀舊常數。
 *
 * 判準用的是 `cardHeld` 在畫面上的兩個後果，兩個都只有 panel 自己會寫：
 *   · 遮罩用「壓住中」的淺色版 (`MATCH_WASH_BACKGROUND_HELD`) 還是完整暗底；
 *   · 計分卡本身 `opacity: 0`（藏起來）還是 `1`（看得到）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { MatchEndPanel } from "./MatchEndPanel";
import {
  MATCH_PANEL_HOLD_MS,
  MATCH_WASH_BACKGROUND,
  MATCH_WASH_BACKGROUND_HELD,
  matchPanelHoldMs,
  matchQuoteDelayMs,
} from "../../render/victoryPresentation";
import { applyVictoryFxDoc, resetVictoryFxPolicy } from "../../vfx/victoryFxPolicy";

/** 本地座位 0 贏了整場 —— 這是唯一會觸發「壓住卡片」的情形。 */
function winningSettlement(): MatchSettlement {
  return {
    matchId: "m-hold",
    winnerTeam: 0,
    perPlayer: [
      {
        seatId: 0,
        accountId: "acc-0",
        champ: "godie-ogrh",
        teamId: 0,
        role: "fighter",
        grade: "A",
        rank: 1,
        stats: createMatchStats(),
      },
      {
        seatId: 1,
        accountId: "acc-1",
        champ: "godie-ucrl",
        teamId: 1,
        role: "mage",
        grade: "B",
        rank: 2,
        stats: createMatchStats(),
      },
    ],
  };
}

/** 渲染出貨的結算面板（贏家視角）並回傳 markup。 */
function renderWinningSettlement(chickenEnabled: boolean): string {
  applyVictoryFxDoc({
    id: "victory-fx",
    schema: "config.victory-fx@1",
    roundVolley: { enabled: false },
    matchChicken: { enabled: chickenEnabled },
  });
  hudStore.setState({
    connected: true,
    phase: "matchEnd",
    localSeatId: 0,
    settlement: winningSettlement(),
  });
  return renderToStaticMarkup(createElement(MatchEndPanel, {}));
}

/** markup 裡「這一格 css 屬性」出現過的值（inline style 是 `key:value;`）。 */
function hasDecl(markup: string, decl: string): boolean {
  return markup.includes(decl);
}

afterEach(() => {
  resetHudStore();
  resetVictoryFxPolicy();
});

describe("烤雞煙火關掉 → 計分卡立刻出現 (owner 2026-08-02)", () => {
  it("煙火關掉：第一幀就是完整暗底 + 卡片不透明（沒有 2.34 秒空等）", () => {
    const html = renderWinningSettlement(false);
    expect(hasDecl(html, MATCH_WASH_BACKGROUND)).toBe(true);
    expect(hasDecl(html, MATCH_WASH_BACKGROUND_HELD)).toBe(false);
    expect(hasDecl(html, "opacity:0;")).toBe(false);
  });

  it("煙火打開：第一幀是「壓住中」的淺遮罩 + 卡片藏著（讓鳥被看到）", () => {
    // 這一條證明上一條不是因為壓住卡片的整段程式被刪掉才綠的。
    const html = renderWinningSettlement(true);
    expect(hasDecl(html, MATCH_WASH_BACKGROUND_HELD)).toBe(true);
    expect(hasDecl(html, "opacity:0;")).toBe(true);
  });

  it("輸家從來不會被壓住 —— 開關開著也一樣", () => {
    applyVictoryFxDoc({
      id: "victory-fx",
      schema: "config.victory-fx@1",
      roundVolley: { enabled: false },
      matchChicken: { enabled: true },
    });
    const lost = winningSettlement();
    lost.winnerTeam = 1; // 對面贏
    hudStore.setState({
      connected: true,
      phase: "matchEnd",
      localSeatId: 0,
      settlement: lost,
    });
    const html = renderToStaticMarkup(createElement(MatchEndPanel, {}));
    expect(hasDecl(html, MATCH_WASH_BACKGROUND_HELD)).toBe(false);
  });
});

describe("兩段延遲的純函式（上面那三條驗的是它們真的被 panel 讀了）", () => {
  it("煙火開＝原本的 2340 ms；煙火關＝0", () => {
    expect(matchPanelHoldMs(true)).toBe(MATCH_PANEL_HOLD_MS);
    expect(matchPanelHoldMs(false)).toBe(0);
  });

  it("名言 永遠排在卡片露出來之後 —— 兩種設定都成立", () => {
    expect(matchQuoteDelayMs(true)).toBeGreaterThan(matchPanelHoldMs(true));
    expect(matchQuoteDelayMs(false)).toBeGreaterThan(matchPanelHoldMs(false));
    // 而且煙火關掉時它真的變短了,不是抄了同一個常數。
    expect(matchQuoteDelayMs(false)).toBeLessThan(matchQuoteDelayMs(true));
  });
});
