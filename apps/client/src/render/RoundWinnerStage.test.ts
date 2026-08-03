/**
 * RoundWinnerStage — the round-win beat: 灰色底 (#93) + the winner's model
 * (#143) + that champion's taunt (#93). Runs headless (node env, no DOM / no
 * WebGL / no audio) via injected canvas, element, previewer and taunt factories,
 * so it asserts the mount → show → swap → clear → dispose contract, the wash
 * parameters and the taunt wiring without a real engine and without a sound.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  RoundWinnerStage,
  podiumSlotOrder,
  type RoundTauntPort,
  type WinnerPreview,
} from "./RoundWinnerStage";
import { DEFAULT_VICTORY_PODIUM } from "@ggd/shared/content/schema/victoryPodium";
import { medalForPlace } from "./victoryCrown";
import {
  ROUND_TAUNT_DELAY_MS,
  ROUND_WASH_FADE_MS,
  ROUND_WASH_Z,
  victoryPresentation,
} from "./victoryPresentation";
import { FOCUS_FADE_OUT_MS } from "./deathFocus";
import type { VictoryTauntLine } from "../audio/victoryTaunt";
import type { ModelDoc } from "@ggd/shared/content";

const DOC = { id: "m.win", glbPath: "/x.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;
const DOC2 = { id: "m.win2", glbPath: "/y.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;

const LINE: VictoryTauntLine = {
  id: "taunt-round-godie-e001-2",
  file: "assets/audio/voice-taunt/round/godie-e001-2.mp3",
  text: "うそだ！抱歉，是真的。你真的輸了。",
};

/** A fake overlay canvas that records removal and tolerates styling. */
function makeFakeCanvas() {
  return { style: {} as Record<string, string>, remove: vi.fn() };
}

/** A fake overlay div: styleable, removable, and it holds subtitle text. */
function makeFakeDiv() {
  return { style: {} as Record<string, string>, remove: vi.fn(), textContent: "" };
}

function makeHarness(opts: { line?: VictoryTauntLine | null } = {}) {
  const canvases: ReturnType<typeof makeFakeCanvas>[] = [];
  const divs: ReturnType<typeof makeFakeDiv>[] = [];
  const previews: WinnerPreview[] = [];
  const host = { appendChild: vi.fn() };
  // Stands in for the real player: the line is chosen (promise resolves) at
  // once, but `onSpeak` only runs when the test calls `speak()` — the delayed
  // beat. A stage that subtitled from the promise would fail the timing test.
  const pending: (() => void)[] = [];
  const taunt: RoundTauntPort & { playRound: ReturnType<typeof vi.fn> } = {
    playRound: vi.fn((_c: string, _r: number, o?: { onSpeak?: (l: VictoryTauntLine) => void }) => {
      const line = opts.line === undefined ? LINE : opts.line;
      if (line) pending.push(() => o?.onSpeak?.(line));
      return Promise.resolve(line);
    }),
    // deliberately does NOT drop `pending`: the real player's own sequence
    // guard covers a cancelled timer, and the STAGE must reject a stale beat
    // that fires anyway — which is what the stale-taunt case below exercises
    cancel: vi.fn(),
  };
  const speak = (): void => {
    for (const fn of pending.splice(0)) fn();
  };
  const stage = new RoundWinnerStage({
    host: host as unknown as HTMLElement,
    createCanvas: () => {
      const c = makeFakeCanvas();
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    createElement: () => {
      const d = makeFakeDiv();
      divs.push(d);
      return d as unknown as HTMLElement;
    },
    createPreview: () => {
      const p: WinnerPreview = { show: vi.fn(), dispose: vi.fn() };
      previews.push(p);
      return p;
    },
    taunt,
  });
  return { stage, host, canvases, divs, previews, taunt, speak };
}

/**
 * DOM order = paint order, and it is: wash → (one CROWN per card) → subtitle.
 *
 * ⚠️ The crowns (GH#257 金/銀/銅) were inserted BETWEEN the wash and the
 * subtitle, so `divs[1]` stopped being the subtitle. Indexing by a magic 1 is
 * exactly how a layer added later silently retargets every assertion in a file,
 * so the subtitle is now addressed by the LAYOUT rule instead of a constant.
 * `members` defaults to 1 because most cases here use the solo `show()`.
 */
const washOf = (divs: ReturnType<typeof makeFakeDiv>[]) => divs[0]!;
const subOf = (divs: ReturnType<typeof makeFakeDiv>[], members = 1) => divs[members + 1]!;

describe("RoundWinnerStage", () => {
  it("is inert until first shown (lazy: no canvas, no wash, no previewer)", () => {
    cover("client-round-winner-lazy");
    const { stage, host, canvases, divs, taunt } = makeHarness();
    expect(stage.active).toBe(false);
    expect(canvases.length).toBe(0);
    expect(divs.length).toBe(0);
    expect(host.appendChild).not.toHaveBeenCalled();
    expect(taunt.playRound).not.toHaveBeenCalled();
  });

  it("mounts the overlay canvas and shows the model on first show", () => {
    cover("client-round-winner-show");
    const { stage, host, canvases, previews } = makeHarness();
    stage.show(DOC);
    expect(canvases.length).toBe(1);
    expect(previews.length).toBe(1);
    // the 2nd arg is the #263 tint context — `show(doc)` with no ctx resolves
    // to an explicit `null` championId, never a stale one
    expect(previews[0]!.show).toHaveBeenCalledWith(DOC, { championId: null, clip: "idle" });
    expect(stage.active).toBe(true);
    // wash + canvas + CROWN + subtitle all mounted into the host (GH#257 added
    // one crown badge per card, so this is 4 rather than the pre-podium 3)
    expect(host.appendChild).toHaveBeenCalledTimes(4);
    // the canvas got centred-card styling (fixed + centre transform)
    expect(canvases[0]!.style.position).toBe("fixed");
    expect(canvases[0]!.style.pointerEvents).toBe("none");
  });

  it("drops a GREY desaturating wash UNDER the winner's card (灰色底)", () => {
    cover("client-round-winner-grey");
    const { stage, canvases, divs } = makeHarness();
    stage.show(DOC);
    const wash = washOf(divs);
    const spec = victoryPresentation("round");
    expect(wash.style.position).toBe("fixed");
    expect(wash.style.inset).toBe("0");
    expect(wash.style.pointerEvents).toBe("none"); // never eats a click
    // SEMANTIC pins, not "it assigned the constant to itself": the beat is a
    // desaturation and it is grey, whatever the exact gradient is retuned to
    expect(wash.style.backdropFilter).toMatch(/grayscale\(0\.[5-9]/);
    expect(wash.style.background).toMatch(/rgba\(\d+, ?\d+, ?\d+/);
    expect(spec.tint).toBe("grey");
    // strictly below the model canvas, so the WINNER keeps its colour
    expect(Number(wash.style.zIndex)).toBe(ROUND_WASH_Z);
    expect(Number(wash.style.zIndex)).toBeLessThan(Number(canvases[0]!.style.zIndex));
  });

  it("CROSSFADES in over the #85 death greyscale instead of stacking on it", () => {
    cover("client-round-winner-grey");
    const { stage, divs } = makeHarness();
    stage.show(DOC, { championId: "godie-e001", round: 2 });
    const wash = washOf(divs);
    // A dead spectator is still looking through the #85 post-process on this
    // very frame; it ramps out over FOCUS_FADE_OUT_MS. Mounting this wash at
    // full opacity stacks two desaturations into an unreadable slab, so it
    // mounts TRANSPARENT and ramps in over exactly the same interval.
    expect(wash.style.opacity).toBe("0");
    expect(ROUND_WASH_FADE_MS).toBe(FOCUS_FADE_OUT_MS);
    expect(wash.style.transition).toBe(`opacity ${FOCUS_FADE_OUT_MS}ms linear`);
  });

  it("speaks the winning champion's taunt (delayed past the 名言) and subtitles it", async () => {
    cover("client-round-winner-taunt");
    const { stage, divs, taunt, speak } = makeHarness();
    stage.show(DOC, { championId: "godie-e001", round: 4 });
    const [champ, round, sent] = taunt.playRound.mock.calls[0]!;
    expect(champ).toBe("godie-e001");
    expect(round).toBe(4);
    expect((sent as { delayMs: number }).delayMs).toBe(ROUND_TAUNT_DELAY_MS);

    // The SUBTITLE must not appear before the voice does: the taunt promise
    // settles on the next microtask (the line is merely CHOSEN), while the clip
    // is 2.2 s away. Printing the punchline there lands it on the round-end 名言.
    await Promise.resolve();
    await Promise.resolve();
    expect(stage.subtitleText).toBe("");

    speak(); // …the delay elapses and the champion actually says it
    expect(subOf(divs).textContent).toBe(LINE.text);
    expect(stage.subtitleText).toBe(LINE.text);
  });

  it("still greys the screen when the winner is unresolvable (no taunt, no subtitle)", async () => {
    cover("client-round-winner-no-champ");
    const { stage, divs, taunt } = makeHarness();
    stage.show(DOC);
    await Promise.resolve();
    expect(taunt.playRound).not.toHaveBeenCalled();
    expect(subOf(divs).textContent).toBe("");
    expect(washOf(divs).style.backdropFilter).toMatch(/grayscale/);
  });

  it("a taunt that resolves after the beat ended never subtitles a stale round", async () => {
    cover("client-round-winner-stale-taunt");
    const { stage, divs, taunt, speak } = makeHarness();
    stage.show(DOC, { championId: "godie-e001", round: 1 });
    const subtitle = subOf(divs);
    stage.clear();
    expect(taunt.cancel).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    speak(); // even a scheduler that fires the stale beat anyway must not print
    expect(subtitle.textContent).toBe("");
  });

  it("swaps the model on a second show without re-mounting the overlay", () => {
    cover("client-round-winner-swap");
    const { stage, host, canvases, divs, previews } = makeHarness();
    stage.show(DOC);
    stage.show(DOC2);
    expect(canvases.length).toBe(1); // same canvas reused
    expect(divs.length).toBe(3); // same wash + crown + subtitle reused
    expect(host.appendChild).toHaveBeenCalledTimes(4);
    expect(previews.length).toBe(1);
    expect(previews[0]!.show).toHaveBeenNthCalledWith(2, DOC2, { championId: null, clip: "idle" });
  });

  it("clear() disposes the previewer and removes every overlay layer", () => {
    cover("client-round-winner-clear");
    const { stage, canvases, divs, previews } = makeHarness();
    stage.show(DOC);
    stage.clear();
    expect(previews[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(canvases[0]!.remove).toHaveBeenCalledTimes(1);
    expect(washOf(divs).remove).toHaveBeenCalledTimes(1);
    expect(subOf(divs).remove).toHaveBeenCalledTimes(1);
    expect(stage.active).toBe(false);
  });

  it("re-shows after a clear by spinning up a fresh canvas + previewer", () => {
    cover("client-round-winner-reshow");
    const { stage, host, canvases, divs, previews } = makeHarness();
    stage.show(DOC);
    stage.clear();
    stage.show(DOC2);
    expect(canvases.length).toBe(2);
    expect(divs.length).toBe(6); // (wash + crown + subtitle) x 2 mounts
    expect(previews.length).toBe(2);
    expect(host.appendChild).toHaveBeenCalledTimes(8);
    expect(previews[1]!.show).toHaveBeenCalledWith(DOC2, { championId: null, clip: "idle" });
    expect(stage.active).toBe(true);
  });

  it("ignores show() after dispose (no canvas resurrected, no taunt)", () => {
    cover("client-round-winner-disposed");
    const { stage, host, canvases, taunt } = makeHarness();
    stage.show(DOC);
    stage.dispose();
    expect(stage.active).toBe(false);
    stage.show(DOC2, { championId: "godie-e001", round: 2 });
    expect(stage.active).toBe(false);
    expect(canvases.length).toBe(1); // no new canvas after dispose
    expect(host.appendChild).toHaveBeenCalledTimes(4);
    expect(taunt.playRound).not.toHaveBeenCalled();
  });

  it("never fires the MATCH-tier celebration (the two beats do not cross-fire)", () => {
    cover("client-round-winner-tier");
    const { stage, divs } = makeHarness();
    stage.show(DOC, { championId: "godie-e001", round: 1 });
    const match = victoryPresentation("match");
    expect(washOf(divs).style.background).not.toBe(match.background);
    expect(washOf(divs).style.backdropFilter).not.toBe(match.backdropFilter);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GH#257 v0.9.27 迴歸:「回合勝利出現的 3d model 是勝利角色 但現在不是」
// ══════════════════════════════════════════════════════════════════════════
/**
 * ⚠️ 這一段讀的是 **`canvas.style.left` 本人**。
 *
 * 稽核實測:在這一段之前,`apps/client/src/render/*.test.ts` 底下**零個**
 * `style.left` 斷言 —— 而這個檔案第 121 行的註解寫著「the canvas got
 * centred-card styling」,底下卻只驗了 `position` 與 `pointerEvents`,一格位置
 * 都沒讀。於是 `styleOverlayCanvas` 的 `left` 算式(v0.9.27 直接用 member index)
 * 可以完全錯掉而 1292 條測試全綠(失敗形態 ③ + ④)。
 *
 * 錯在哪:三張卡時 `((index + 0.5) / 3) * 100` 讓 **member[1] 落在 50%** ——
 * 螢幕正中央、玩家第一眼看的地方,站的是**第二名**,而第二名依定義是這一回合
 * 倒下的人。owner 看到的就是這個。
 */
describe("頒獎台的站位是一個欄位,而且畫面上真的照它擺 (round-podium-layout)", () => {
  const TRIO = [1, 2, 3].map((place) => ({
    doc: DOC,
    championId: `c${place}`,
    place,
    medal: medalForPlace(place),
  }));
  const pct = (v: string | undefined): number => Number.parseFloat(String(v));

  it("centreFirst(出貨值):金冠站正中央 50%,銀在左、銅在右", () => {
    cover("client-round-winner-show");
    const { stage, canvases } = makeHarness();
    stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, podiumLayout: "centreFirst" });
    expect(stage.memberCount).toBe(3);
    // 金冠 = members[0]。字面上的 "50%",不是「大約中間」。
    expect(canvases[0]!.style.left).toBe("50%");
    expect(pct(canvases[1]!.style.left)).toBeLessThan(50); // 銀在左
    expect(pct(canvases[2]!.style.left)).toBeGreaterThan(50); // 銅在右
    // 純函式版本的同一件事(拿掉 slot 對映 → 這一條先紅)
    expect(podiumSlotOrder(3, "centreFirst")).toEqual([1, 0, 2]);
  });

  it("★ 出貨值真的是 centreFirst —— 不傳 cfg 的呼叫端拿到的就是它", () => {
    cover("client-round-winner-show");
    // GameApp 的 `showTeam(plan.members, plan.ctx)` 是兩個引數,cfg 走預設。
    // 預設如果退回 rank,畫面正中央又會變成第二名,而上面那一條(明著傳 cfg)
    // 仍然是綠的 —— 失敗形態 ⑤:被測的不是出貨的那個。
    const { stage, canvases } = makeHarness();
    stage.showTeam(TRIO, {});
    expect(canvases[0]!.style.left).toBe("50%");
    expect(DEFAULT_VICTORY_PODIUM.podiumLayout).toBe("centreFirst");
    expect(stage.memberCount).toBe(3);
  });

  it("rank(v0.9.27 的舊行為)反過來:正中央是第二名 —— 對照組", () => {
    cover("client-round-winner-show");
    // 少了這一條,上面那兩條對「left 永遠是 50%」的壞實作也會過。
    const { canvases } = makeHarness();
    const h2 = makeHarness();
    h2.stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, podiumLayout: "rank" });
    expect(h2.canvases[1]!.style.left).toBe("50%"); // ← 第二名在正中央
    expect(pct(h2.canvases[0]!.style.left)).toBeLessThan(50); // 金冠被擠到最左
    expect(canvases).toHaveLength(0); // (第一個 harness 沒被用到)
    expect(podiumSlotOrder(3, "rank")).toEqual([0, 1, 2]);
  });

  it("winnerScale:金卡真的比較大,而且疊在鄰居上面", () => {
    cover("client-round-winner-show");
    const big = makeHarness();
    big.stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, winnerScale: 1.25 });
    expect(Number(big.canvases[0]!.style.zIndex)).toBeGreaterThan(
      Number(big.canvases[1]!.style.zIndex),
    );
    expect(big.canvases[0]!.style.width).not.toBe(big.canvases[1]!.style.width);
    expect(big.canvases[0]!.style.height).not.toBe(big.canvases[1]!.style.height);
    // 欄位真的被讀:1.0 時三張卡回到一模一樣(而不是「有一個欄位存在」)
    const flat = makeHarness();
    flat.stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, winnerScale: 1 });
    expect(flat.canvases[0]!.style.width).toBe(flat.canvases[1]!.style.width);
    expect(flat.canvases[0]!.style.zIndex).toBe(flat.canvases[1]!.style.zIndex);
    expect(DEFAULT_VICTORY_PODIUM.winnerScale).toBe(1.25);
  });

  it("人數沒變但政策變了的那一回合,版面也要跟著換(圖層是重用的)", () => {
    cover("client-round-winner-swap");
    const { stage, canvases } = makeHarness();
    stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, podiumLayout: "rank" });
    expect(canvases[0]!.style.left).not.toBe("50%");
    // 同樣三個人 → 不重建圖層。只在建立時套用版面的實作會在這裡卡住舊位置。
    stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, podiumLayout: "centreFirst" });
    expect(canvases).toHaveLength(3);
    expect(canvases[0]!.style.left).toBe("50%");
  });

  it("皇冠跟著自己那張卡走,不會飄到別人頭上", () => {
    cover("client-round-winner-show");
    const { stage, canvases, divs } = makeHarness();
    stage.showTeam(TRIO, {}, { ...DEFAULT_VICTORY_PODIUM, podiumLayout: "centreFirst" });
    expect(stage.memberCount).toBe(3);
    // divs = wash, crown x3, subtitle —— 冠的 left 逐一等於它那張卡的 left
    for (let i = 0; i < 3; i++) {
      expect(divs[1 + i]!.style.left).toBe(canvases[i]!.style.left);
    }
  });

  it("單人與雙人不會退化成一堆特例", () => {
    cover("client-round-winner-show");
    expect(podiumSlotOrder(1, "centreFirst")).toEqual([0]);
    expect(podiumSlotOrder(2, "centreFirst")).toEqual([0, 1]);
    expect(podiumSlotOrder(4, "centreFirst")).toEqual([1, 0, 2, 3]);
    // 每一種都必須是一個真的排列(沒有兩個人搶同一格,也沒有空格)
    for (const n of [1, 2, 3, 4, 5, 8]) {
      const order = podiumSlotOrder(n, "centreFirst");
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});
