/**
 * couch-viewport-rects: split-screen viewport rect math — 1 full, 2 vertical
 * halves, 3-4 = 2x2 quadrants (3 leaves bottom-right empty for the
 * scoreboard); CSS mirror flips the y origin.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { viewportRects, cssRects, emptyQuadrantCss } from "./viewportRects";

describe("viewportRects (couch split-screen)", () => {
  it("1 player fills the screen", () => {
    cover("couch-viewport-rects");
    expect(viewportRects(1)).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
  });

  it("2 players split into vertical halves (left | right)", () => {
    cover("couch-viewport-rects");
    expect(viewportRects(2)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ]);
  });

  it("3 players use a 2x2 grid with the bottom-right quadrant empty", () => {
    cover("couch-viewport-rects");
    const r = viewportRects(3);
    expect(r).toEqual([
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0, y: 0, w: 0.5, h: 0.5 },
    ]);
    expect(emptyQuadrantCss(3)).toEqual({ left: 50, top: 50, w: 50, h: 50 });
  });

  it("4 players fill the full 2x2 grid; no empty quadrant", () => {
    cover("couch-viewport-rects");
    const r = viewportRects(4);
    expect(r).toHaveLength(4);
    expect(r[3]).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    // rects tile the unit square exactly
    expect(r.reduce((a, v) => a + v.w * v.h, 0)).toBeCloseTo(1);
    expect(emptyQuadrantCss(4)).toBeNull();
  });

  it("clamps out-of-range counts instead of exploding", () => {
    cover("couch-viewport-rects");
    expect(viewportRects(0)).toHaveLength(1);
    expect(viewportRects(-3)).toHaveLength(1);
    expect(viewportRects(9)).toHaveLength(4);
  });

  it("CSS mirror flips the y origin (Babylon bottom-left -> CSS top-left)", () => {
    cover("couch-viewport-rects");
    // player 0 of a 4-way split is TOP-left on screen
    expect(cssRects(4)[0]).toEqual({ left: 0, top: 0, w: 50, h: 50 });
    // player 3 is BOTTOM-right
    expect(cssRects(4)[3]).toEqual({ left: 50, top: 50, w: 50, h: 50 });
    // 2-way: both full height
    expect(cssRects(2)[1]).toEqual({ left: 50, top: 0, w: 50, h: 100 });
  });
});
