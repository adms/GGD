/**
 * RoundWinnerStage — the round-win beat: 灰色底 (#93) + the winner's model
 * (#143) + that champion's taunt (#93). Runs headless (node env, no DOM / no
 * WebGL / no audio) via injected canvas, element, previewer and taunt factories,
 * so it asserts the mount → show → swap → clear → dispose contract, the wash
 * parameters and the taunt wiring without a real engine and without a sound.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { RoundWinnerStage, type RoundTauntPort, type WinnerPreview } from "./RoundWinnerStage";
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

/** wash is the first div created, subtitle the second (DOM order = paint order) */
const washOf = (divs: ReturnType<typeof makeFakeDiv>[]) => divs[0]!;
const subOf = (divs: ReturnType<typeof makeFakeDiv>[]) => divs[1]!;

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
    expect(previews[0]!.show).toHaveBeenCalledWith(DOC, { championId: null });
    expect(stage.active).toBe(true);
    // wash + canvas + subtitle all mounted into the host
    expect(host.appendChild).toHaveBeenCalledTimes(3);
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
    expect(divs.length).toBe(2); // same wash + subtitle reused
    expect(host.appendChild).toHaveBeenCalledTimes(3);
    expect(previews.length).toBe(1);
    expect(previews[0]!.show).toHaveBeenNthCalledWith(2, DOC2, { championId: null });
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
    expect(divs.length).toBe(4);
    expect(previews.length).toBe(2);
    expect(host.appendChild).toHaveBeenCalledTimes(6);
    expect(previews[1]!.show).toHaveBeenCalledWith(DOC2, { championId: null });
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
    expect(host.appendChild).toHaveBeenCalledTimes(3);
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
