/**
 * roundWinnerSpacing — GH#545。owner 2026-08-22:
 * >「勝利結算三個3d model 角色**靠在一起不要分那麼開**」
 *
 * 驗**機制**⛔ 不驗數字(間距的家是政策)。基準線 = `podiumSlotCentrePct(…, 1)`,
 * 也就是舊算式本人 —— ⛔ 不抄 16.667。全部走出貨的 `showTeam`(失敗形態⑤)。
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

const DOC = { id: "m.win", glbPath: "/x.glb" } as unknown as ModelDoc;
const TRIO = [1, 2, 3].map((place) => ({ doc: DOC, championId: `c${place}`, place, medal: medalForPlace(place) }));
type Fake = { style: Record<string, string>; remove: () => void; textContent: string };

function makeHarness() {
  const canvases: Fake[] = [];
  const divs: Fake[] = [];
  const make = (into: Fake[]) => (): never => {
    const el = { style: {} as Record<string, string>, remove: vi.fn(), textContent: "" };
    into.push(el);
    return el as never;
  };
  const stage = new RoundWinnerStage({
    host: { appendChild: vi.fn() } as unknown as HTMLElement,
    createCanvas: make(canvases),
    createElement: make(divs),
    createPreview: (): WinnerPreview => ({ show: vi.fn(), dispose: vi.fn() }),
  });
  return { stage, canvases, divs };
}

const pct = (v?: string): number => Number.parseFloat(String(v));
/** 這一格離畫面中心多遠。「靠在一起」＝ 這個數字變小。 */
const spread = (v?: string): number => Math.abs(pct(v) - 50);
/** `min(Xvh, Yvw)` 裡的 Y —— 寬度受限(直式)視窗上真的被畫出來的那一個。 */
const vwCap = (v?: string): number => Number.parseFloat(/,\s*([\d.]+)vw/.exec(String(v))![1]!);
// ⭐ `podiumSpacing` 已經在 shared 的型別上（Zod + `DEFAULT_VICTORY_PODIUM` + 後台），
// 所以這裡**不需要** cast —— 這個夾具手搭 policy 物件，⛔ 它讀不到出貨檔，
// 出貨那一條的守衛是 `schema/newKnobsAreLive.test.ts`（失敗形態⑤）。
const cfg = (podiumSpacing: number): VictoryPodiumPolicy => ({
  ...DEFAULT_VICTORY_PODIUM,
  podiumSpacing,
});

describe("頒獎台的疏密是一格政策,畫面上真的照它擺 (round-podium-spacing GH#545)", () => {
  it("★ 出貨路徑真的靠得比舊算式近 —— owner「不要分那麼開」", () => {
    cover("client-round-winner-show");
    const { stage, canvases } = makeHarness();
    stage.showTeam(TRIO, {}); // ⛔ 不傳 cfg:走 victoryPodiumPolicy() 的那一條
    const before = Math.abs(podiumSlotCentrePct(0, 3, 1) - 50); // = 舊行為 ((slot+0.5)/n)*100
    expect(canvases[0]!.style.left).toBe("50%"); // 金冠仍在正中(GH#257 不可迴歸)
    expect(spread(canvases[1]!.style.left)).toBeLessThan(before); // 銀往中間靠
    expect(spread(canvases[2]!.style.left)).toBeLessThan(before); // 銅往中間靠
    expect(pct(canvases[1]!.style.left)).toBeLessThan(50); // 而且左右沒對調
    expect(pct(canvases[2]!.style.left)).toBeGreaterThan(50);
  });

  it("★ 換值就換位置,皇冠跟著自己那張卡;寬度受限時卡片也跟著收", () => {
    cover("client-round-winner-show");
    const wide = makeHarness();
    const tight = makeHarness();
    wide.stage.showTeam(TRIO, {}, cfg(1));
    tight.stage.showTeam(TRIO, {}, cfg(0.4));
    for (const i of [1, 2]) {
      expect(spread(tight.canvases[i]!.style.left)).toBeLessThan(spread(wide.canvases[i]!.style.left));
      // divs = wash, crown x3, subtitle —— 冠沒跟著收就會飄到卡片外面
      expect(tight.divs[1 + i]!.style.left).toBe(tight.canvases[i]!.style.left);
    }
    // ⭐ 少了這兩條,「調緊」在直式視窗上＝三張卡疊成一堆(桌機由 vh 上限決定,看不出來)
    expect(vwCap(tight.canvases[1]!.style.width)).toBeLessThan(vwCap(wide.canvases[1]!.style.width));
    expect(vwCap(tight.canvases[1]!.style.height)).toBeLessThan(vwCap(wide.canvases[1]!.style.height));
  });
});
