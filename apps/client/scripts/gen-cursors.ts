/**
 * gen-cursors — draws the JRPG cursor set and writes it to public/cursors/ as
 * SVG masters plus the PNG size ladder the browser actually uses.
 *   Run: tsx apps/client/scripts/gen-cursors.ts
 *
 * THE DESIGN (task #54a — "畫面中太多物件", the pointer gets lost in a busy
 * arena). Three variants, drawn to match the JRPG menu skin task #24 gave every
 * button (ui/buttonFx.css): dark-indigo panel, brass/gold trim, 45° notch
 * silhouette, cyan→violet→magenta→gold cyber glow.
 *
 *   default — a HOLY SWORD (聖劍) laid along the 45° axis, tip at the hotspot:
 *             pale steel blade, gold cross-guard and pommel, dark grip, gold
 *             gem at the junction, all inside a heavy near-black contour.
 *             The user asked for this read specifically: 「請你畫成一把簡單形狀
 *             的聖劍 來符合風格」 (the earlier arrow was legible but not RPG).
 *   pointer — the SAME sword IGNITED for anything clickable: the blade goes
 *             white-hot, the gem turns cyan, and the classic JRPG ▶ selector
 *             rides beside it. Identical silhouette, so the shape never
 *             "jumps" — only its material changes.
 *
 * PROPORTION IS WHAT SELLS IT. The first cut put the shoulder 34 units down the
 * axis and it read as a dagger; the blade now runs 40 units against a ~16-unit
 * hilt (≈70% blade), which is what makes it a sword at a glance. Keep that
 * ratio if the shapes are ever re-cut.
 *   attack  — a crimson diamond RETICLE with four spikes and a gold pip, for an
 *             armed attack-move over the arena. Reads as danger at a glance and
 *             shares the .ggd-btn--danger crimson/magenta ramp.
 *
 * VISIBILITY IS THE POINT, so every variant is built the same way: a wide
 * near-black contour UNDER a bright trim. The dark ring keeps it readable on the
 * bright arena floor; the bright trim keeps it readable on the dark UI panels.
 * Neither background can swallow the cursor.
 *
 * WHY THE ART LIVES IN A SCRIPT (same call as scripts/gen-icons.ts): no image
 * dependency, no binary blobs edited by hand — the shapes below are the design
 * source, and BOTH outputs are generated from them, so the SVG master and the
 * PNG the browser loads can never drift apart. The filenames, the size ladder
 * and the hotspots all come from src/cursor/cursorTheme.ts, the module the
 * runtime reads, so a size added there is picked up here automatically.
 *
 * The rasteriser is a small analytic one (point-in-polygon + distance-to-path,
 * 4×4 supersampled): shapes this simple do not need a real 2D engine, and doing
 * it here keeps the output reproducible byte-for-byte on any machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png";
import {
  CURSOR_DESIGN_UNITS as U,
  CURSOR_SIZES,
  CURSOR_SIZE_PX,
  CURSOR_VARIANTS,
  cursorAssetFile,
  cursorHotspot,
  cursorSvgFile,
  type CursorVariant,
} from "../src/cursor/cursorTheme";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "cursors");

// ------------------------------------------------------------- palette ----
// Lifted from ui/buttonFx.css + ui/theme.ts so the cursor is the same material
// as the buttons it flies over.
const INK = "#05070c"; // outer contour — the "always visible" layer
const NAVY = "#10141f"; // .ggd-btn panel bottom
const NAVY_HI = "#28345a"; // .ggd-btn panel top, lifted for contrast
const BRASS = "#caa64a"; // .ggd-btn--primary border
const GOLD = "#ffd76a"; // .ggd-btn--primary text
const GOLD_MID = "#f2c637"; // theme.ts GOLD
const GOLD_DEEP = "#a97c18";
const SPEC = "#fff6d0"; // specular highlight on the lit blade
const CYAN = "#35f1ff"; // cyber-glow ramp
const VIOLET = "#7a5cff";
const CRIMSON = "#ff4f7a"; // .ggd-btn--danger ramp
const MAGENTA = "#ff2fd0";

// -------------------------------------------------------------- shapes ----
// All coordinates are in the 64-unit design space (cursorTheme's
// CURSOR_DESIGN_UNITS). Y grows downward, like the screen.

type Pt = readonly [number, number];

// THE HOLY SWORD (聖劍). The user asked for the RPG read: "請你畫成一把簡單形狀
// 的聖劍 來符合風格" — while keeping what already worked, i.e. it stays legible
// over a busy arena.
//
// Everything lies on the 45° down-right axis a = (0.7071, 0.7071), with the
// BLADE TIP pinned at [4.6, 4.6] — the same point the old arrow used, so
// CURSOR_HOTSPOT_DESIGN and every derived per-size hotspot are unchanged and
// aiming does not move.
//
// Four separate shapes rather than one silhouette: a cross-guard drawn as part
// of a single polygon would need a self-intersecting path, and the rasteriser
// is an even-odd point-in-polygon test. Separate convex pieces also let the
// blade take a pale steel ramp while the furniture takes gold, which is what
// actually sells "holy sword" instead of "grey dagger".

/** Blade: sharp tip, quick flare, then near-parallel sides to the shoulder. */
const ARROW: readonly Pt[] = [
  [4.6, 4.6], // tip — the hotspot lives just outside this, at 3.9/3.9
  [14.07, 9.27], // flare, upper-right edge
  [35.71, 30.05], // shoulder, upper-right
  [30.05, 35.71], // shoulder, lower-left
  [9.27, 14.07], // flare, lower-left edge
];

/**
 * Specular sliver hugging the blade's upper-left edge (drawn over the trim).
 * Kept narrow — ~2.2 units — because the blade is only ~8 units across and a
 * fatter sliver swallows the body it is supposed to accent.
 */
const ARROW_EDGE: readonly Pt[] = [
  [4.6, 4.6],
  [14.07, 9.27],
  [35.71, 30.05],
  [34.15, 31.61],
  [12.51, 10.83],
];

/** Cross-guard: the bar that makes it read as a SWORD and not as an arrow. */
const GUARD: readonly Pt[] = [
  [38.82, 23.26],
  [42.5, 26.94],
  [26.94, 42.5],
  [23.26, 38.82],
];

/** Grip, from the guard down to the pommel. */
const GRIP: readonly Pt[] = [
  [34.44, 31.32],
  [31.32, 34.44],
  [38.39, 41.51],
  [41.51, 38.39],
];

/** Gem at the blade/guard junction — the one detail that survives down to 32px. */
const GEM: readonly Pt[] = [
  [32.88, 29.68],
  [36.08, 32.88],
  [32.88, 36.08],
  [29.68, 32.88],
];

/** The JRPG ▶ selector, riding beside the lit blade (interactive variant). */
const CHEVRON: readonly Pt[] = [
  [42.0, 37.0],
  [55.0, 45.0],
  [42.0, 53.0],
];

/** Attack reticle: one diamond ring + four outward spikes from its vertices. */
const DIAMOND: readonly Pt[] = [
  [32, 13],
  [51, 32],
  [32, 51],
  [13, 32],
];
const SPIKES: readonly (readonly Pt[])[] = [
  [
    [32, 13],
    [32, 4],
  ],
  [
    [51, 32],
    [60, 32],
  ],
  [
    [32, 51],
    [32, 60],
  ],
  [
    [13, 32],
    [4, 32],
  ],
];

// ---------------------------------------------------------- draw model ----

interface Stop {
  at: number;
  color: string;
}

type Paint =
  | { kind: "solid"; color: string }
  | { kind: "linear"; from: Pt; to: Pt; stops: readonly Stop[] };

const solid = (color: string): Paint => ({ kind: "solid", color });
const ramp = (from: Pt, to: Pt, stops: readonly Stop[]): Paint => ({
  kind: "linear",
  from,
  to,
  stops,
});

type Op =
  /** soft bloom falling off from a path — the cyber glow */
  | { kind: "glow"; path: readonly Pt[]; closed: boolean; radius: number; color: string; alpha: number }
  | { kind: "fill"; path: readonly Pt[]; paint: Paint; alpha: number }
  | { kind: "stroke"; path: readonly Pt[]; closed: boolean; width: number; paint: Paint; alpha: number }
  | { kind: "disc"; c: Pt; r: number; paint: Paint; alpha: number };

const glow = (path: readonly Pt[], radius: number, color: string, alpha: number, closed = true): Op => ({
  kind: "glow",
  path,
  closed,
  radius,
  color,
  alpha,
});
const fill = (path: readonly Pt[], paint: Paint, alpha = 1): Op => ({ kind: "fill", path, paint, alpha });
const stroke = (path: readonly Pt[], width: number, paint: Paint, alpha = 1, closed = true): Op => ({
  kind: "stroke",
  path,
  closed,
  width,
  paint,
  alpha,
});
const disc = (c: Pt, r: number, paint: Paint, alpha = 1): Op => ({ kind: "disc", c, r, paint, alpha });

/** Contour width. Wide enough to survive the 32px step (≈1.4px per side). */
const CONTOUR = 5.6;
/** Bright trim width, drawn on top of the contour. */
const TRIM = 2.4;

/** Blade steel: pale at the tip, cooling into the shadow near the shoulder. */
const BLADE_STEEL = ramp([4.6, 4.6], [32.88, 32.88], [
  { at: 0, color: SPEC },
  { at: 0.6, color: "#cfd8ea" },
  { at: 1, color: "#7d8aa8" },
]);
/** Blade when lit: the holy blade goes white-hot rather than merely brighter. */
const BLADE_HOLY = ramp([4.6, 4.6], [32.88, 32.88], [
  { at: 0, color: "#ffffff" },
  { at: 0.55, color: SPEC },
  { at: 1, color: GOLD },
]);
/** Gold furniture (guard + pommel), lit from the guard tip. */
const FURNITURE = ramp([38.82, 23.26], [26.94, 42.5], [
  { at: 0, color: GOLD },
  { at: 0.5, color: GOLD_MID },
  { at: 1, color: GOLD_DEEP },
]);
/** Grip leather — the one dark element, so the gold reads as metal beside it. */
const GRIP_DARK = ramp([31.32, 31.32], [41.51, 41.51], [
  { at: 0, color: NAVY_HI },
  { at: 1, color: NAVY },
]);

/** Draw the sword furniture (guard, grip, pommel, gem) in one place. */
const sword = (opts: {
  blade: Paint;
  bladeTrim: string;
  edge: string;
  edgeAlpha: number;
  gem: string;
  glows: readonly Op[];
}): readonly Op[] => [
  ...opts.glows,
  // grip + pommel first: the guard and blade overlap them, never the reverse
  stroke(GRIP, CONTOUR, solid(INK)),
  fill(GRIP, GRIP_DARK),
  disc([42.07, 42.07], 3.2 + CONTOUR / 2, solid(INK)),
  disc([42.07, 42.07], 3.2, FURNITURE),
  stroke(GUARD, CONTOUR, solid(INK)),
  fill(GUARD, FURNITURE),
  stroke(GUARD, 1.4, solid(GOLD_DEEP), 0.9),
  stroke(ARROW, CONTOUR, solid(INK)),
  fill(ARROW, opts.blade),
  stroke(ARROW, TRIM, solid(opts.bladeTrim)),
  fill(ARROW_EDGE, solid(opts.edge), opts.edgeAlpha),
  fill(GEM, solid(opts.gem)),
  stroke(GEM, 1.3, solid(INK), 0.85),
];

const ART: Record<CursorVariant, readonly Op[]> = {
  // Resting: steel blade, gold cross-guard, dark grip, gold gem.
  default: sword({
    blade: BLADE_STEEL,
    bladeTrim: BRASS,
    edge: SPEC,
    edgeAlpha: 0.95,
    gem: GOLD_MID,
    glows: [glow(ARROW, 4.5, CYAN, 0.3), glow(GUARD, 3.5, GOLD, 0.22)],
  }),
  // Interactive: the blade ignites white-hot and the ▶ selector rides alongside.
  pointer: [
    // the selector first, so the sword always overlaps it if they crowd
    glow(CHEVRON, 3.5, CYAN, 0.32),
    stroke(CHEVRON, CONTOUR, solid(INK)),
    fill(CHEVRON, ramp([42, 37], [55, 53], [
      { at: 0, color: GOLD },
      { at: 1, color: GOLD_DEEP },
    ])),
    stroke(CHEVRON, 1.6, solid(NAVY)),
    ...sword({
      blade: BLADE_HOLY,
      bladeTrim: GOLD_DEEP,
      edge: "#ffffff",
      edgeAlpha: 1,
      gem: CYAN,
      glows: [
        glow(ARROW, 6.0, SPEC, 0.42),
        glow(ARROW, 3.2, VIOLET, 0.28),
        glow(GUARD, 4.0, GOLD, 0.3),
      ],
    }),
  ],
  // Armed attack-move: crimson reticle, gold pip dead centre. Deliberately ONE
  // ring: an inner second ring survived the 96px step but turned the middle of
  // the 32px raster to mush — and the middle is exactly where the hotspot is
  // and where the player is trying to aim. The magenta half of the
  // .ggd-btn--danger ramp is carried by the bloom instead of a second outline.
  attack: [
    glow(DIAMOND, 6.0, CRIMSON, 0.38),
    glow(DIAMOND, 3.0, MAGENTA, 0.3),
    ...SPIKES.map((s) => stroke(s, CONTOUR, solid(INK), 1, false)),
    stroke(DIAMOND, CONTOUR + 0.8, solid(INK)),
    stroke(DIAMOND, 3.4, solid(CRIMSON)),
    ...SPIKES.map((s) => stroke(s, 2.6, solid(GOLD), 1, false)),
    disc([32, 32], 3.8, solid(INK)),
    disc([32, 32], 2.3, solid(GOLD)),
  ],
};

// ------------------------------------------------------------ geometry ----

type RGB = readonly [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour of a paint at a design-space point. */
function paintAt(paint: Paint, x: number, y: number): RGB {
  if (paint.kind === "solid") return hexToRgb(paint.color);
  const [x0, y0] = paint.from;
  const [x1, y1] = paint.to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / len2));
  const stops = paint.stops;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (t <= b.at || i === stops.length - 1) {
      const span = b.at - a.at || 1;
      return lerpRgb(hexToRgb(a.color), hexToRgb(b.color), Math.min(1, Math.max(0, (t - a.at) / span)));
    }
  }
  return hexToRgb(stops[0]!.color);
}

/** Even-odd ray cast — every shape here is simple, so it matches nonzero. */
function insidePolygon(path: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const [xi, yi] = path[i]!;
    const [xj, yj] = path[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x: number, y: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  const px = a[0] + t * dx - x;
  const py = a[1] + t * dy - y;
  return Math.sqrt(px * px + py * py);
}

/** Shortest distance from a point to a polyline / closed polygon outline. */
function distToPath(path: readonly Pt[], closed: boolean, x: number, y: number): number {
  let best = Infinity;
  const n = path.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const d = distToSegment(x, y, path[i]!, path[(i + 1) % n]!);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------- rasteriser ----

/** Sub-samples per axis. 4×4 is plenty for straight-edged shapes. */
const SS = 4;

/** Coverage of one op at a design-space sample point (0..1). */
function coverage(op: Op, x: number, y: number): number {
  switch (op.kind) {
    case "fill":
      return insidePolygon(op.path, x, y) ? 1 : 0;
    case "stroke":
      return distToPath(op.path, op.closed, x, y) <= op.width / 2 ? 1 : 0;
    case "disc": {
      const dx = x - op.c[0];
      const dy = y - op.c[1];
      return Math.sqrt(dx * dx + dy * dy) <= op.r ? 1 : 0;
    }
    case "glow": {
      const d = distToPath(op.path, op.closed, x, y);
      if (d >= op.radius) return 0;
      const t = 1 - d / op.radius;
      return t * t; // quadratic falloff — a soft bloom, not a halo
    }
  }
}

/** Render one variant at `px` × `px` into a straight-RGBA buffer. */
function rasterise(variant: CursorVariant, px: number): Buffer {
  const scale = px / U;
  // straight (non-premultiplied) accumulation buffers
  const r = new Float64Array(px * px);
  const g = new Float64Array(px * px);
  const b = new Float64Array(px * px);
  const a = new Float64Array(px * px);

  for (const op of ART[variant]!) {
    const paintColor = op.kind === "glow" ? null : op.paint;
    for (let yi = 0; yi < px; yi++) {
      for (let xi = 0; xi < px; xi++) {
        // average sub-sample coverage; colour is sampled at the pixel centre
        // (all our gradients are smooth over many pixels)
        let cov = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const dx = (xi + (sx + 0.5) / SS) / scale;
            const dy = (yi + (sy + 0.5) / SS) / scale;
            cov += coverage(op, dx, dy);
          }
        }
        cov /= SS * SS;
        if (cov <= 0) continue;

        const sa = cov * op.alpha;
        const cx = (xi + 0.5) / scale;
        const cy = (yi + 0.5) / scale;
        const [sr, sg, sb] =
          paintColor === null ? hexToRgb((op as { color: string }).color) : paintAt(paintColor, cx, cy);

        // src-over on straight colours
        const i = yi * px + xi;
        const da = a[i]!;
        const outA = sa + da * (1 - sa);
        if (outA <= 0) continue;
        r[i] = (sr * sa + r[i]! * da * (1 - sa)) / outA;
        g[i] = (sg * sa + g[i]! * da * (1 - sa)) / outA;
        b[i] = (sb * sa + b[i]! * da * (1 - sa)) / outA;
        a[i] = outA;
      }
    }
  }

  const out = Buffer.alloc(px * px * 4);
  for (let i = 0; i < px * px; i++) {
    out[i * 4] = Math.round(Math.min(255, Math.max(0, r[i]!)));
    out[i * 4 + 1] = Math.round(Math.min(255, Math.max(0, g[i]!)));
    out[i * 4 + 2] = Math.round(Math.min(255, Math.max(0, b[i]!)));
    out[i * 4 + 3] = Math.round(Math.min(255, Math.max(0, a[i]! * 255)));
  }
  return out;
}

// -------------------------------------------------------- svg emission ----

const pts = (path: readonly Pt[]): string => path.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * The SVG master for a variant — the same ops, so it is a faithful (vector)
 * twin of the shipped raster, kept for future re-cuts and design review. NOT
 * loaded at runtime: Safari does not support SVG in `cursor: url()`.
 */
function toSvg(variant: CursorVariant): string {
  const defs: string[] = [];
  const body: string[] = [];
  let gid = 0;

  const paintRef = (paint: Paint): string => {
    if (paint.kind === "solid") return paint.color;
    const id = `grad${gid++}`;
    const stops = paint.stops
      .map((s) => `      <stop offset="${s.at}" stop-color="${s.color}" />`)
      .join("\n");
    defs.push(
      `    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
        `x1="${paint.from[0]}" y1="${paint.from[1]}" x2="${paint.to[0]}" y2="${paint.to[1]}">\n` +
        `${stops}\n    </linearGradient>`,
    );
    return `url(#${id})`;
  };

  for (const op of ART[variant]!) {
    const tag = (op as { closed?: boolean }).closed === false ? "polyline" : "polygon";
    switch (op.kind) {
      case "glow":
        body.push(
          `  <${op.closed ? "polygon" : "polyline"} points="${pts(op.path)}" fill="none" ` +
            `stroke="${op.color}" stroke-width="${op.radius * 2}" stroke-linejoin="round" ` +
            `stroke-linecap="round" opacity="${op.alpha}" filter="url(#bloom)" />`,
        );
        break;
      case "fill":
        body.push(
          `  <polygon points="${pts(op.path)}" fill="${paintRef(op.paint)}" fill-opacity="${op.alpha}" />`,
        );
        break;
      case "stroke":
        body.push(
          `  <${tag} points="${pts(op.path)}" fill="none" stroke="${paintRef(op.paint)}" ` +
            `stroke-width="${op.width}" stroke-opacity="${op.alpha}" stroke-linejoin="round" ` +
            `stroke-linecap="round" />`,
        );
        break;
      case "disc":
        body.push(
          `  <circle cx="${op.c[0]}" cy="${op.c[1]}" r="${op.r}" fill="${paintRef(op.paint)}" ` +
            `fill-opacity="${op.alpha}" />`,
        );
        break;
    }
  }

  const hot = cursorHotspot(variant, "l");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- GENERATED by apps/client/scripts/gen-cursors.ts — do not edit by hand.`,
    `     Vector master for the "${variant}" cursor. The runtime loads the PNG`,
    `     ladder beside it (Safari has no SVG cursor support). Hotspot at 64px:`,
    `     ${hot.x},${hot.y}. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${U} ${U}" width="${U}" height="${U}">`,
    `  <defs>`,
    `    <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">`,
    `      <feGaussianBlur stdDeviation="2" />`,
    `    </filter>`,
    ...defs,
    `  </defs>`,
    ...body,
    `</svg>`,
    ``,
  ].join("\n");
}

// ----------------------------------------------------------------- main ----

mkdirSync(OUT_DIR, { recursive: true });

for (const variant of CURSOR_VARIANTS) {
  writeFileSync(join(OUT_DIR, cursorSvgFile(variant)), toSvg(variant), "utf8");
  console.log(`wrote public/cursors/${cursorSvgFile(variant)} (vector master)`);
  for (const size of CURSOR_SIZES) {
    const px = CURSOR_SIZE_PX[size];
    const file = cursorAssetFile(variant, size);
    writeFileSync(join(OUT_DIR, file), encodePng(px, px, rasterise(variant, px)));
    const hot = cursorHotspot(variant, size);
    console.log(`wrote public/cursors/${file} (${px}x${px}, hotspot ${hot.x},${hot.y})`);
  }
}
