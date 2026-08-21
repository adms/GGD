/**
 * GH#528 —— owner 2026-08-22:
 *   「回合結算的成績會檔到右邊勝利第三人的3d model 最好做成可以摺疊展開」
 *
 * 兩件事,兩件都是**行為**:
 *   ① 收合後卡片下緣退到銅牌那張卡的**中線之上**(＝踩在地上的模型本體整個
 *      露出來),而展開的那一張從那張卡的**上緣一路蓋到下緣**。⛔ 少了第二半,
 *      「收合也一樣高」的壞實作照樣綠(失敗形態 ④)。
 *   ② 摺疊鈕是**真的 `<button>`**(`PadFocusNav` 的 selector 只認得它)並帶著
 *      `data-pad-back`。
 *
 * ⚠️ 頒獎台的幾何**不抄數字**:讀 `render/RoundWinnerStage.ts`(同
 * `roundReportLayout.test.ts` 讀 `Minimap.tsx`)。⚠️ 收合後的高度也**不讀常數**,
 * 從渲染出來的標記算(⛔ 否則被測的不是出貨的那個,失敗形態 ⑤)。
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
import { RoundVictoryView, roundCardStartsCollapsed } from "./RoundVictoryPanel";

const VP = { width: 1280, height: 720 };

/** 銅牌(`centreFirst` ⇒ 銀左·金中·銅右)那張卡的中線與下緣,px。 */
function podiumBand(): { mid: number; bottom: number } {
  const src = readFileSync(
    fileURLToPath(new URL("../../render/RoundWinnerStage.ts", import.meta.url)),
    "utf8",
  );
  const fn = src.slice(src.indexOf("function styleOverlayCanvas"));
  const top = Number(/s\.top = "(\d+)%"/.exec(fn)![1]);
  // 高度那一行(⛔ 不是它上面那行寬度 —— 兩行長得一模一樣)
  const [, a, b, c] = /`min\(\$\{vh\((\d+) \/ n \+ (\d+)\)\}vh, \$\{vw\((\d+) \/ n\)\}vw\)`/.exec(
    fn.slice(fn.indexOf("const h = n === 1")),
  )!;
  const n = DEFAULT_VICTORY_PODIUM.podiumSize;
  // 銅牌不吃 winnerScale(那是金卡的),所以 k = 1。
  const h = Math.min(
    (Math.min(88, Math.round(Number(a) / n + Number(b))) / 100) * VP.height,
    (Math.min(96, Math.round(Number(c) / n)) / 100) * VP.width,
  );
  const mid = (top / 100) * VP.height;
  return { mid, bottom: mid + h / 2 };
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
    expect(rect.y + rect.h, "展開:整片蓋過銅牌那張卡").toBeGreaterThan(podium.bottom);
    // 根節點是 absolute + width + max-height ⇒ 高度 auto,所以卡身整段不渲染時
    // 盒子的高度就是「上下內距 + 卡頭那一列」—— 兩個數字都從標記讀回來。
    const m = html(true);
    expect(m, "卡身還在 ⇒ 盒子沒縮,下面算的高度是假的").not.toContain("data-ggd-round-body");
    const h =
      Number(/padding:(\d+)px /.exec(m)![1]) * 2 +
      Number(/data-ggd-round-head[^>]*height:(\d+)px/.exec(m)![1]);
    // ⚠️ 誠實地說:1280×720 這個最擠的視窗上它仍然壓到那張卡最上面約 30px 的
    // 頭頂空白(註冊表把這個 surface 的上緣放在 y=210,模型列從 y≈241 開始)。
    // ⛔ 不可以靠「把卡頭壓到 30px」讓數字好看 —— 等第與抬頭就讀不出來了。
    expect(rect.y + h, "收合:下緣退到模型那張卡的中線之上").toBeLessThan(podium.mid);
  });

  it("摺疊鈕是手把摸得到的真按鈕,而且出貨預設走不擋模型的那一邊", () => {
    const head = html(true);
    expect(/<button[^>]*data-ggd-round-collapse="collapsed"/.test(head)).toBe(true);
    expect(head).toContain("data-pad-back");
    expect(head).toContain('aria-expanded="false"');
    expect(html(false)).toContain("data-ggd-round-body");
    // 後台那一格真的被出貨面板讀到(內容登錄表是空的 ⇒ 出貨預設)。
    expect(roundCardStartsCollapsed()).toBe(DEFAULT_VICTORY_PODIUM.roundCardCollapsed);
  });
});
