/**
 * testImages — SYNTHETIC reference images, drawn in code, one defect each.
 *
 * WHY NOT REAL ASSETS. A guard test that loads `content/assets/icons/...`
 * asserts "this file currently trips this guard". Re-export the icon and it goes
 * green with nothing fixed, or red with nothing broken — it measures the corpus,
 * not the code. Drawing the fixtures means each one contains EXACTLY the defect
 * its name says, so the assertion is about the guard.
 *
 * These are real PNG bytes (through `@ggd/shared/voxel/pngWrite`) and the tests
 * push them through the real `decodePng`, so the decoder is on the tested path
 * rather than bypassed by handing the extractor a pixel array directly.
 *
 * SIZE. The canvas is 128×480 so the bbox (432 rows) resamples onto 100
 * normalised rows at ~4.3 source rows each. That ratio is not cosmetic — it is
 * the mechanism the anti-aliasing guard depends on: a one-pixel blended fringe
 * is outvoted 4:1 by the flat colour around it, which is what makes the MODE
 * survive where a MEAN would report the blend.
 */
import { encodePng } from "@ggd/shared/voxel/pngWrite";

export interface Canvas {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export const CANVAS_W = 128;
export const CANVAS_H = 480;

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function setPixel(c: Canvas, x: number, y: number, hex: string, alpha = 255): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const [r, g, b] = rgbOf(hex);
  const o = (y * c.width + x) * 4;
  c.rgba[o] = r;
  c.rgba[o + 1] = g;
  c.rgba[o + 2] = b;
  c.rgba[o + 3] = alpha;
}

export function fillRect(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  hex: string,
  alpha = 255,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(c, xx, yy, hex, alpha);
  }
}

export function canvas(width = CANVAS_W, height = CANVAS_H, fill = "#ffffff"): Canvas {
  const c: Canvas = { width, height, rgba: new Uint8Array(width * height * 4) };
  fillRect(c, 0, 0, width, height, fill);
  return c;
}

export function toPng(c: Canvas): Uint8Array {
  return encodePng(c.width, c.height, c.rgba);
}

/** Linear blend of two hexes — used ONLY to draw an anti-aliased fringe. The
 *  extractor must never produce a colour like this; that is the point. */
export function blend(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  const mix = (u: number, v: number): string =>
    Math.round(u + (v - u) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

// ---------------------------------------------------------------------------
// the builder
// ---------------------------------------------------------------------------

export interface FigureSpec {
  width?: number;
  height?: number;
  bg?: string;
  /** column left edge / width */
  x?: number;
  w?: number;
  /** column top edge / height */
  y?: number;
  h?: number;
  /** top-to-bottom band colours, split evenly over `h` */
  bands: readonly string[];
  /** a solid border drawn around the column, inside `w`×`h` */
  frame?: { hex: string; px: number };
  /** paint a one-pixel blended row at each internal band boundary */
  antialias?: boolean;
}

/** A standing column of flat colour bands on a plain background. */
export function figure(spec: FigureSpec): Canvas {
  const width = spec.width ?? CANVAS_W;
  const height = spec.height ?? CANVAS_H;
  const c = canvas(width, height, spec.bg ?? "#ffffff");
  const x = spec.x ?? 24;
  const w = spec.w ?? 80;
  const y = spec.y ?? 24;
  const h = spec.h ?? 432;
  let bx = x;
  let bw = w;
  let by = y;
  let bh = h;
  if (spec.frame) {
    fillRect(c, x, y, w, h, spec.frame.hex);
    bx += spec.frame.px;
    bw -= spec.frame.px * 2;
    by += spec.frame.px;
    bh -= spec.frame.px * 2;
  }
  const n = spec.bands.length;
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(by + Math.round((i * bh) / n));
  for (let i = 0; i < n; i++) {
    fillRect(c, bx, edges[i]!, bw, edges[i + 1]! - edges[i]!, spec.bands[i]!);
  }
  if (spec.antialias) {
    for (let i = 1; i < n; i++) {
      fillRect(c, bx, edges[i]! - 1, bw, 1, blend(spec.bands[i - 1]!, spec.bands[i]!, 0.5));
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// the fixtures
// ---------------------------------------------------------------------------

/** The control image's colours, top to bottom. Exported so the test asserts
 *  against the SAME constants that were painted, not a transcription of them. */
export const CLEAN_THREE = Object.freeze(["#e8b21c", "#d94b2b", "#1f3fa8"] as const);

/** 乾淨的三段條碼圖 — the acceptance control. No frame, no AA, plain white
 *  background, three hard-edged thirds. */
export function cleanThreeBand(): Canvas {
  return figure({ bands: CLEAN_THREE });
}

/** Five well-separated bands: every guard should stay silent, so a PASS here
 *  proves the guards are not simply always-on. */
export const CLEAN_FIVE = Object.freeze([
  "#e8b21c",
  "#f2cfae",
  "#d94b2b",
  "#1f3fa8",
  "#3d2a18",
] as const);

export function cleanFiveBand(): Canvas {
  return figure({ bands: CLEAN_FIVE });
}

// ── 外框 ───────────────────────────────────────────────────────────────────
export const FRAME_HEX = "#141414";

/** A w3x-style dark border wrapping the figure. Background removal cannot reach
 *  it (it is opaque and nothing like the paper), so without the guard the first
 *  and last bands come out frame-coloured. */
export function framedFigure(): Canvas {
  return figure({ bands: CLEAN_FIVE, frame: { hex: FRAME_HEX, px: 12 } });
}

// ── 背景非單色 ─────────────────────────────────────────────────────────────
export const BLEED_NEAR_WHITE = "#f2f2f2";
export const BLEED_CORE = "#d94b2b";

/**
 * A vignetted, non-solid background whose shade is within ΔE 8 of the figure's
 * own near-white clothing, so the flood-fill walks straight through the outer
 * bands and only a core survives — the read is left with far too little
 * character to band. This is the shape 規格 §4.2 catches with 前景 < 40%.
 */
export function backgroundBleed(): Canvas {
  const c = figure({
    bands: [BLEED_NEAR_WHITE, BLEED_CORE, BLEED_NEAR_WHITE],
  });
  // a soft vignette: not one colour, and every shade of it floods from the edge
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const edge = Math.min(x, y, CANVAS_W - 1 - x, CANVAS_H - 1 - y);
      if (edge < 8) setPixel(c, x, y, edge % 2 === 0 ? "#f7f7f7" : "#fbfbfb");
    }
  }
  return c;
}

// ── 反鋸齒 ─────────────────────────────────────────────────────────────────
/** The same five clean bands, with a blended row at every internal boundary.
 *  Those blends are colours that exist nowhere on the character. */
export function antialiasedFigure(): Canvas {
  return figure({ bands: CLEAN_FIVE, antialias: true });
}

/** The mid-colours the AA fringe introduces — the test asserts none of them
 *  comes back as a band. */
export const AA_FRINGE_HEXES: readonly string[] = Object.freeze(
  CLEAN_FIVE.slice(1).map((hex, i) => blend(CLEAN_FIVE[i]!, hex, 0.5)),
);

// ── 沒填滿畫框 ─────────────────────────────────────────────────────────────
/** The figure occupies only 45% of the canvas height — wide enough that it
 *  clears the 40% foreground floor, so the ONLY guard it can trip is the bbox
 *  one. */
export function shortFigure(): Canvas {
  return figure({ bands: CLEAN_FIVE, x: 4, w: 120, y: 132, h: 216 });
}

// ── 泥巴柱 ─────────────────────────────────────────────────────────────────
/**
 * Four colours on a small circle in CIE a*b* at constant L*: every ADJACENT
 * pair is 15.2 ΔE apart (so they survive run-merging as four separate bands)
 * while the FARTHEST pair is 22.1 (under the 25 floor). That combination is
 * what makes this fixture a mud-column test and not a band-count test.
 */
export const MUD_BANDS = Object.freeze(["#977d84", "#8b8371", "#6e8983", "#798496"] as const);

export function mudColumn(): Canvas {
  return figure({ bands: MUD_BANDS });
}

// ── 帶數過少 ───────────────────────────────────────────────────────────────
/** Two bands, far apart in colour, so the mud-column guard cannot be what
 *  fires. */
export const TWO_BANDS = Object.freeze(["#e8b21c", "#1f3fa8"] as const);

export function twoBandFigure(): Canvas {
  return figure({ bands: TWO_BANDS });
}

// ── 眾數 vs 平均 ───────────────────────────────────────────────────────────
/** Each band is split left/right into two very different colours, 60% / 40%.
 *  A MEAN over the row would report the blend — the purple that is nowhere on
 *  the character. A MODE reports the wider of the two. */
// A palette DELIBERATELY disjoint from CLEAN_FIVE, so this figure and the clean
// one are two different characters — that is what lets the DUPLICATE guard's
// negative case ("do not flag two different characters") mean anything.
export const SPLIT_MAJOR = Object.freeze([
  "#2fa36b",
  "#f0e6c8",
  "#b03a5b",
  "#2b6cb0",
  "#4a3b2a",
] as const);
export const SPLIT_MINOR = Object.freeze([
  "#2b6cb0",
  "#4a3b2a",
  "#2fa36b",
  "#b03a5b",
  "#f0e6c8",
] as const);

/** The colours a per-row MEAN would invent. None may appear as a band. */
export const SPLIT_MEANS: readonly string[] = Object.freeze(
  SPLIT_MAJOR.map((hex, i) => blend(hex, SPLIT_MINOR[i]!, 0.4)),
);

export function splitColumn(): Canvas {
  const c = figure({ bands: SPLIT_MAJOR });
  const n = SPLIT_MAJOR.length;
  const y = 24;
  const h = 432;
  // repaint the right 40% of each band with the minority colour
  for (let i = 0; i < n; i++) {
    const y0 = y + Math.round((i * h) / n);
    const y1 = y + Math.round(((i + 1) * h) / n);
    fillRect(c, 24 + 48, y0, 32, y1 - y0, SPLIT_MINOR[i]!);
  }
  return c;
}

// ── 圖示重複 ───────────────────────────────────────────────────────────────
/** Byte-identical twins — the shape the icon corpus is already known to be in
 *  (141 files, 87 distinct hashes, 24 duplicate groups).
 *
 *  Built from `splitColumn` rather than `cleanFiveBand` so a test can put the
 *  twins AND an unrelated clean figure in the same batch: if the twins shared
 *  the clean figure's palette, the batch would contain three copies of one
 *  character and the "names the FIRST one" assertion would be meaningless. */
export function duplicatePair(): [Canvas, Canvas] {
  return [splitColumn(), splitColumn()];
}
