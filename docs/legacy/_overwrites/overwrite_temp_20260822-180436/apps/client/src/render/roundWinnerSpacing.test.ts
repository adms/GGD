/**
 * roundWinnerSpacing — GH#545 的守衛。owner 2026-08-22:
 * > 「勝利結算三個3d model 角色**靠在一起不要分那麼開**」
 *
 * 驗的是**機制會不會發生**,⛔ 不是「間距等於零點幾」(那個數字的家是政策,
 * 不是這個檔)。三條:
 *   ① 出貨路徑(`showTeam` 不傳 cfg)真的比舊算式緊 —— 舊算式就是
 *      `podiumSlotCentrePct(slot, n, 1)`,所以基準線從函式自己推導,⛔ 不抄字面值。
 *   ② 間距是一格**政策**:同一個 harness 換一個值,兩側的卡片與**皇冠**一起動。
 *   ③ 卡片寬度的 vw 上限跟著間距收 —— 少了這一條,直式視窗上「調緊」＝「疊成一堆」。
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_VICTORY_PODIUM,
  type VictoryPodiumPolicy,
} from "@ggd/shared/content/schema/victoryPodium";
import type { ModelDoc } from "@ggd/shared/content";
import { RoundWinnerStage, podiumSlotCentrePct, type WinnerPreview } from "./RoundWinnerStage";
import { medalForPlace } from "./victoryCrown";

const DOC = { id: "m.win", glbPath: "/x.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;
const TRIO = [1, 2, 3].map((place) => ({
  doc: DOC,
  championId: `c${place}`,
  place,
  medal: medalForPlace(place),
}));

function makeHarness() {
  const canvases: { style: Record<string, string>; remove: () => void }[] = [];
  const divs: { style: Record<string, string>; remove: () => void; textContent: string }[] = [];
  const stage = new RoundWinnerStage({
    host: { appendChild: vi.fn() } as unknown as HTMLElement,
    createCanvas: () => {
      const c = { style: {} as Record<string, string>, remove: vi.fn() };
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    createElement: () => {
      const d = { style: {} as Record<string, string>, remove: vi.fn(), textContent: "" };
      divs.push(d);
      return d as unknown as HTMLElement;
    },
    createPreview: (): WinnerPreview => ({ show: vi.fn(), dispose: vi.fn() }),
  });
  return { stage, canvases, divs };
}

const pct = (v: string | undefined): number => Number.parseFloat(String(v));
/** 這一格離畫面中心多遠。「靠在一起」＝ 這個數字變小。 */
const spread = (v: string | undefined): number => Math.abs(pct(v) - 50);
/** `min(Xvh, Yvw)` 裡的 Y —— 寬度受限的直式視窗上真的被畫出來的那一個。 */
const vwCap = (v: string | undefined): number =>
  Number.parseFloat(/,\s*([\d.]+)vw/.exec(String(v))![1]!);
// ⚠️ `podiumSpacing` 還不在 shared 的型別上(見 RoundWinnerStage 的 FALLBACK 註解),
// 所以這裡明著 cast —— 接進 Zod 之後這個 cast 會變成多餘的。
const cfg = (podiumSpacing: number): VictoryPodiumPolicy =>
  ({ ...DEFAULT_VICTORY_PODIUM, podiumSpacing }) as VictoryPodiumPolicy;

describe("頒獎台的疏密是一格政策,而且畫面上真的照它擺 (round-podium-spacing GH#545)", () => {
  it("★ 出貨路徑真的靠得比舊算式近 —— owner「不要分那麼開」", () => {
    cover("client-round-winner-show");
    const { stage, canvases } = makeHarness();
    stage.showTeam(TRIO, {}); // ⛔ 不傳 cfg:走 victoryPodiumPolicy() 的那一條(失敗形態⑤)
    // 舊行為 = ((slot + 0.5) / n) * 100,逐字等於 spacing === 1。
    const before = Math.abs(podiumSlotCentrePct(0, 3, 1) - 50);
    expect(canvases[0]!.style.left).toBe("50%"); // 金冠仍在正中(GH#257 不可迴歸)
    expect(spread(canvases[1]!.style.left)).toBeLessThan(before); // 銀往中間靠
    expect(spread(canvases[2]!.style.left)).toBeLessThan(before); // 銅往中間靠
    expect(pct(canvases[1]!.style.left)).toBeLessThan(50); // 而且沒有左右對調
    expect(pct(canvases[2]!.style.left)).toBeGreaterThan(50);
  });

  it("★ 它是一格政策(換值就換位置),皇冠跟著自己那張卡走", () => {
    cover("client-round-winner-show");
    const wide = makeHarness();
    const tight = makeHarness();
    wide.stage.showTeam(TRIO, {}, cfg(1));
    tight.stage.showTeam(TRIO, {}, cfg(0.4));
    for (const i of [1, 2]) {
      expect(spread(tight.canvases[i]!.style.left)).toBeLessThan(
        spread(wide.canvases[i]!.style.left),
      );
      // divs = wash, crown x3, subtitle —— 冠沒有跟著收就會飄到卡片外面
      expect(tight.divs[1 + i]!.style.left).toBe(tight.canvases[i]!.style.left);
    }
  });

  it("★ 寬度受限時卡片跟著收 —— 否則「調緊」在直式視窗上＝疊成一堆", () => {
    cover("client-round-winner-show");
    const wide = makeHarness();
    const tight = makeHarness();
    wide.stage.showTeam(TRIO, {}, cfg(1));
    tight.stage.showTeam(TRIO, {}, cfg(0.4));
    expect(vwCap(tight.canvases[1]!.style.width)).toBeLessThan(
      vwCap(wide.canvases[1]!.style.width),
    );
    expect(vwCap(tight.canvases[1]!.style.height)).toBeLessThan(
      vwCap(wide.canvases[1]!.style.height),
    );
  });
});
