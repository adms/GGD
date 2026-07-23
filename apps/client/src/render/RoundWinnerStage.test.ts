/**
 * RoundWinnerStage (task #143) — the overlay-canvas lifecycle around the reused
 * StorePreview loader. Runs headless (node env, no DOM / no WebGL) via injected
 * canvas + previewer factories, so it asserts the mount → show → swap → clear →
 * dispose contract without a real engine.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { RoundWinnerStage, type WinnerPreview } from "./RoundWinnerStage";
import type { ModelDoc } from "@ggd/shared/content";

const DOC = { id: "m.win", glbPath: "/x.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;
const DOC2 = { id: "m.win2", glbPath: "/y.glb", scale: 1, clipMap: {} } as unknown as ModelDoc;

/** A fake overlay canvas that records removal and tolerates styling. */
function makeFakeCanvas() {
  return { style: {} as Record<string, string>, remove: vi.fn() };
}

function makeHarness() {
  const canvases: ReturnType<typeof makeFakeCanvas>[] = [];
  const previews: WinnerPreview[] = [];
  const host = { appendChild: vi.fn() };
  const stage = new RoundWinnerStage({
    host: host as unknown as HTMLElement,
    createCanvas: () => {
      const c = makeFakeCanvas();
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    createPreview: () => {
      const p: WinnerPreview = { show: vi.fn(), dispose: vi.fn() };
      previews.push(p);
      return p;
    },
  });
  return { stage, host, canvases, previews };
}

describe("RoundWinnerStage", () => {
  it("is inert until first shown (lazy: no canvas, no previewer)", () => {
    cover("client-round-winner-lazy");
    const { stage, host, canvases } = makeHarness();
    expect(stage.active).toBe(false);
    expect(canvases.length).toBe(0);
    expect(host.appendChild).not.toHaveBeenCalled();
  });

  it("mounts the overlay canvas and shows the model on first show", () => {
    cover("client-round-winner-show");
    const { stage, host, canvases, previews } = makeHarness();
    stage.show(DOC);
    expect(canvases.length).toBe(1);
    expect(host.appendChild).toHaveBeenCalledTimes(1);
    expect(previews.length).toBe(1);
    expect(previews[0]!.show).toHaveBeenCalledWith(DOC);
    expect(stage.active).toBe(true);
    // the canvas got centred-card styling (fixed + centre transform)
    expect(canvases[0]!.style.position).toBe("fixed");
    expect(canvases[0]!.style.pointerEvents).toBe("none");
  });

  it("swaps the model on a second show without re-mounting the canvas", () => {
    cover("client-round-winner-swap");
    const { stage, host, canvases, previews } = makeHarness();
    stage.show(DOC);
    stage.show(DOC2);
    expect(canvases.length).toBe(1); // same canvas reused
    expect(host.appendChild).toHaveBeenCalledTimes(1);
    expect(previews.length).toBe(1);
    expect(previews[0]!.show).toHaveBeenNthCalledWith(2, DOC2);
  });

  it("clear() disposes the previewer and removes the overlay canvas", () => {
    cover("client-round-winner-clear");
    const { stage, canvases, previews } = makeHarness();
    stage.show(DOC);
    stage.clear();
    expect(previews[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(canvases[0]!.remove).toHaveBeenCalledTimes(1);
    expect(stage.active).toBe(false);
  });

  it("re-shows after a clear by spinning up a fresh canvas + previewer", () => {
    cover("client-round-winner-reshow");
    const { stage, host, canvases, previews } = makeHarness();
    stage.show(DOC);
    stage.clear();
    stage.show(DOC2);
    expect(canvases.length).toBe(2);
    expect(previews.length).toBe(2);
    expect(host.appendChild).toHaveBeenCalledTimes(2);
    expect(previews[1]!.show).toHaveBeenCalledWith(DOC2);
    expect(stage.active).toBe(true);
  });

  it("ignores show() after dispose (no canvas resurrected)", () => {
    cover("client-round-winner-disposed");
    const { stage, host, canvases } = makeHarness();
    stage.show(DOC);
    stage.dispose();
    expect(stage.active).toBe(false);
    stage.show(DOC2);
    expect(stage.active).toBe(false);
    expect(canvases.length).toBe(1); // no new canvas after dispose
    expect(host.appendChild).toHaveBeenCalledTimes(1);
  });
});
