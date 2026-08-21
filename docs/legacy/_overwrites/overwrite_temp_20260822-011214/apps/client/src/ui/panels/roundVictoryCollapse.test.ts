/**
 * GH#528 —— owner 2026-08-22:
 *   「回合結算的成績會檔到右邊勝利第三人的3d model 最好做成可以摺疊展開」
 *
 * 這一支只問兩件事,而且兩件都是**行為**不是屬性:
 *   ① 收合之後,成績卡的下緣退到銅牌那張卡的**中線之上**(＝被框住、踩在地上的
 *      模型本體整個露出來),而展開的那一張從那張卡的**上緣一路蓋到下緣**。
 *      ⛔ 少了第二半,對一個「收合也一樣高」的壞實作也會綠(失敗形態 ④)。
 *   ② 摺疊鈕是一個**真的 `<button>`**,`PadFocusNav` 的 FOCUSABLE_SELECTOR
 *      認得它,而且帶著 `data-pad-back`(B 直接收起來)。
 *
 * ⚠️ 頒獎台的幾何**不抄一份數字進來**:它是 `render/RoundWinnerStage.ts` 的
 * `styleOverlayCanvas` 算的,所以這裡讀那個檔(同 `roundReportLayout.test.ts`
 * 讀 `Minimap.tsx` 的作法)。哪天有人把那一排模型挪走,這一支會跟著紅。
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { hudSurfaceRect } from "../hud/hudSurfaces";
import { buildRoundVictory } from "./roundVictory";
import {
  RoundVictoryView,
  ROUND_VICTORY_HEADER_H,
  roundCardStartsCollapsed,
} from "./RoundVictoryPanel";

const VP = { width: 1280, height: 720 };

/** 銅牌(最右邊那一位,`centreFirst` ⇒ 銀左·金中·銅右)卡片的上緣 / 中線 / 下緣,px。 */
function podiumBand(): { top: number; mid: number; bottom: number } {
  const src = readFileSync(
    fileURLToPath(new URL("../../render/RoundWinnerStage.ts", import.meta.url)),
    "utf8",
  );
  const fn = src.slice(src.indexOf("function styleOverlayCanvas"));
  const top = Number(/s\.top = "(\d+)%"/.exec(fn)![1]);
  // 高度那一行(⛔ 不是寬度那一行,它在上面一行、長得一模一樣)
  const hLine = fn.slice(fn.indexOf("const h = n === 1"));
  const [, a, b, c] = /`min\(\$\{vh\((\d+) \/ n \+ (\d+)\)\}vh, \$\{vw\((\d+) \/ n\)\}vw\)`/.exec(
    hLine,
  )!;
  const n = DEFAULT_VICTORY_PODIUM.podiumSize;
  // 銅牌不吃 winnerScale(那是金卡的),所以 k = 1。
  const h = Math.min(
    (Math.min(88, Math.round(Number(a) / n + Number(b))) / 100) * VP.height,
    (Math.min(96, Math.round(Number(c) / n)) / 100) * VP.width,
  );
  const mid = (top / 100) * VP.height;
  return { top: mid - h / 2, mid, bottom: mid + h / 2 };
}

/**
 * 收合狀態下這個盒子在畫面上真正的高度,**從渲染出來的標記算**(⛔ 不是讀那個
 * 常數 —— 那會變成失敗形態 ⑤:被測的不是出貨的那個)。根節點是
 * `position:absolute` + `width` + `max-height`,高度是 `auto`,所以卡身整段不在
 * 標記裡的時候,盒子的高度就是「上下內距 + 卡頭那一列」。
 */
function collapsedBoxHeight(): number {
  const m = html(true);
  expect(m, "卡身還在標記裡 ⇒ 盒子沒有縮,下面算出來的高度就是假的").not.toContain(
    "data-ggd-round-body",
  );
  const padY = Number(/padding:(\d+)px /.exec(m)![1]);
  const headH = Number(/data-ggd-round-head[^>]*height:(\d+)px/.exec(m)![1]);
  return padY * 2 + headH;
}

function html(collapsed: boolean): string {
  const model = buildRoundVictory({
    matchId: "m-1",
    round: 2,
    localTeamId: 0,
    selfSeatId: 0,
    outcome: ROUND_OUTCOME.WON,
    seats: [
      { seatId: 0, teamId: 0, championId: "thorne", displayName: "P0", roundKills: 2, roundDeaths: 0, alive: true, mobKills: 4 },
    ],
    prevMobKills: {},
  });
  return renderToStaticMarkup(
    createElement(RoundVictoryView, {
      model,
      standings: [],
      localTeamId: 0,
      roundsSeen: 1,
      defaultCollapsed: collapsed,
    }),
  );
}

describe("回合成績卡摺疊 (GH#528)", () => {
  it("收合後模型本體露出來,展開的那一張從上緣蓋到下緣", () => {
    const rect = hudSurfaceRect("round-victory", VP, false, { phase: "resolution", panels: [] })!;
    const podium = podiumBand();
    // 展開:整張卡從銅牌那張卡的**上緣一路蓋到下緣** —— 這就是 owner 看到的。
    expect(rect.y + rect.h).toBeGreaterThan(podium.bottom);
    // 收合:下緣退到那張卡的**中線之上**,也就是被框住、踩在地上的模型本體
    // 完全露出來。
    // ⚠️ 誠實地說:1280×720 這個最擠的視窗上它仍然壓到那張卡最上面約 30px 的
    // 頭頂空白 —— 因為註冊表把這個 surface 的上緣放在 y=210,而模型那一列從
    // y≈241 開始,中間只有 31px。⛔ 不可以靠「把卡頭壓到 30px」來讓數字好看,
    // 那會讓等第與抬頭讀不出來,而且下一個視窗又會翻掉。
    expect(rect.y + collapsedBoxHeight()).toBeLessThan(podium.mid);
  });

  it("收合＝卡身整段不渲染(⛔ 不是藏起來的空盒子),而且出貨預設走不擋模型的那一邊", () => {
    expect(html(true)).not.toContain("data-ggd-round-body");
    expect(html(false)).toContain("data-ggd-round-body");
    expect(html(true)).toContain(`height:${ROUND_VICTORY_HEADER_H}px`);
    // 後台那一格真的被出貨面板讀到（內容登錄表是空的 ⇒ 出貨預設）。
    expect(roundCardStartsCollapsed()).toBe(DEFAULT_VICTORY_PODIUM.roundCardCollapsed);
  });

  it("摺疊鈕是手把摸得到的真按鈕,而且 B 收得起來", () => {
    const head = html(true);
    expect(/<button[^>]*data-ggd-round-collapse="collapsed"/.test(head)).toBe(true);
    expect(head).toContain("data-pad-back");
    expect(head).toContain('aria-expanded="false"');
    expect(html(false)).toContain('aria-expanded="true"');
  });
});
