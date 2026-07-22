/**
 * Split-screen viewport rect math — PURE (no Babylon imports; the DOM HUD
 * grid shares it). 1 player = full screen, 2 = vertical halves (left|right),
 * 3-4 = 2x2 grid in reading order (top-left, top-right, bottom-left,
 * bottom-right); with 3 players the bottom-right quadrant stays empty and the
 * HUD parks the scoreboard there.
 */

/** Normalized (0..1) viewport rect; y measured from the BOTTOM (Babylon). */
export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Player k -> its Babylon viewport rect. */
export function viewportRects(playerCount: number): ViewportRect[] {
  const n = Math.min(4, Math.max(1, Math.floor(playerCount)));
  if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) {
    return [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ];
  }
  const quads: ViewportRect[] = [
    { x: 0, y: 0.5, w: 0.5, h: 0.5 }, // top-left
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, // top-right
    { x: 0, y: 0, w: 0.5, h: 0.5 }, // bottom-left
    { x: 0.5, y: 0, w: 0.5, h: 0.5 }, // bottom-right
  ];
  return quads.slice(0, n);
}

/** CSS rect (top-left origin, percent units) for one player's DOM overlay. */
export interface CssRect {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** Same layout as viewportRects but in CSS screen coordinates. */
export function cssRects(playerCount: number): CssRect[] {
  return viewportRects(playerCount).map((r) => ({
    left: r.x * 100,
    top: (1 - r.y - r.h) * 100,
    w: r.w * 100,
    h: r.h * 100,
  }));
}

/** The unused 2x2 quadrant (3-player couch): its CSS rect, else null. */
export function emptyQuadrantCss(playerCount: number): CssRect | null {
  if (Math.min(4, Math.max(1, Math.floor(playerCount))) !== 3) return null;
  return { left: 50, top: 50, w: 50, h: 50 };
}
