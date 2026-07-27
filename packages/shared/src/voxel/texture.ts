/**
 * texture — the 16×16 palette image a generated figure samples.
 *
 * The mesh has ONE material and ONE texture; every box face's four UVs sit on
 * the texel CENTRE of its palette slot (`boxman.slotUv`). So the "texture" is
 * not art, it is a lookup table, and generating it from the look's hex colours
 * is what makes a palette edit in the studio a real re-skin rather than a
 * preview-only tint.
 *
 * WHY EVERY COLUMN IS FILLED TOP TO BOTTOM. A sampler set to linear filtering,
 * or a mip level the engine picks on its own, can average neighbouring texels.
 * Filling the whole column with its slot colour (and repeating the 8 slots into
 * columns 8–15) means every possible average of neighbours within a column is
 * that same colour, so a filtering mode nobody chose deliberately cannot smear
 * two body parts into each other. It costs 1 KB.
 *
 * `Uint8Array`, not `Buffer`: this module has to run in the admin's browser
 * bundle as well as in the node bake. `tools/voxel-gen/png.ts` wraps the result
 * (`Buffer.from(rgba)`) rather than owning the pixel decision — that keeps the
 * bake and the studio looking at literally the same bytes, and gives task #231
 * (體素角色貼圖自動生成) exactly one place to plug into.
 */
import { TEX_EDGE, type SlotName, SLOT } from "./boxman";
import type { VoxelLook } from "./look";

export interface PaletteImage {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major, top row first — the layout a PNG IDAT wants */
  readonly rgba: Uint8Array;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** The palette image for a look. Pure, deterministic, allocation-only. */
export function paletteRgba(look: VoxelLook): PaletteImage {
  const w = TEX_EDGE;
  const h = TEX_EDGE;
  const rgba = new Uint8Array(w * h * 4);
  const slots = look.palette.map(parseHex);
  for (let x = 0; x < w; x++) {
    const c = slots[x % slots.length] ?? [255, 0, 255];
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

/** `#rrggbb` for a slot, for the studio's swatch row. */
export function slotColor(look: VoxelLook, slot: SlotName): string {
  return look.palette[SLOT[slot]] ?? "#ffffff";
}

// ===========================================================================
// 分帶 — turning a barcode part's bands into TEXEL ROWS (規格 §7)
// ===========================================================================
//
// WHY THIS LIVES HERE AND NOT IN THE PAINTER.
// The painter's job is to move bytes; this is the arithmetic that decides WHAT
// COLOUR each texel row is, and it is the one step where a plausible-looking
// implementation silently destroys a character. It is therefore its own pure,
// separately-tested function, and the painter is not allowed a second opinion.
//
// THE FAILURE THIS EXISTS TO PREVENT — 細帶被四捨五入吃掉.
// 魯夫's head carries four bands whose within-part shares are
// 0.4444 / 0.1111 / 0.0833 / 0.3611, and the head rect is EIGHT texels tall.
// Round each boundary independently and you get cuts at 0, 4, 4, 5, 8 — the
// 紅帽帶 gets ZERO rows and disappears. 規格 §2.1 is explicit that this is not
// an acceptable simplification: 「魯夫拿掉紅帽帶，就只是『一頂褐色帽子』」.
//
// So every present band is guaranteed AT LEAST ONE ROW, and the rows that are
// left over are handed out by the largest-remainder method in band order.
// Guarantee first, proportionality second — that ordering is the whole point.

/** A band as the row allocator wants it: a colour and a share of the part. */
export interface BandSpan {
  readonly hex: string;
  /** share of THIS part's height; the caller's shares need not sum to 1 */
  readonly frac: number;
}

/** A band's texel span inside a part's atlas rect, in rect-local rows. */
export interface BandRow {
  readonly hex: string;
  /** first texel row, inclusive */
  readonly y0: number;
  /** one past the last texel row */
  readonly y1: number;
}

/**
 * Allocate `height` texel rows among `bands`, in order, top to bottom.
 *
 * Contract, in the order the rules are applied:
 *   1. every band gets ≥ 1 row (see the header — this outranks proportionality);
 *   2. the remaining rows go by largest remainder of the proportional ideal,
 *      ties broken by band index so the result is a pure function of the input;
 *   3. the rows tile `[0, height)` exactly — no gap, no overlap, and the last
 *      band's `y1` is `height` by construction, not by accumulated rounding.
 *
 * THROWS when `height < bands.length`, instead of dropping the bands that do not
 * fit. A part too short for its bands is an authoring error the operator has to
 * see; silently painting three of a character's four head bands is precisely the
 * "did it but the player can't get it" shape this whole feature is guarding.
 */
export function bandRows(bands: readonly BandSpan[], height: number): BandRow[] {
  const n = bands.length;
  if (n === 0) return [];
  if (!Number.isInteger(height) || height < n) {
    throw new Error(`bandRows: ${n} band(s) do not fit in ${height} texel row(s)`);
  }

  const counts = new Array<number>(n).fill(1);
  const spare = height - n;
  if (spare > 0) {
    // The proportional ideal MINUS the row already guaranteed, so a band that
    // is genuinely tiny competes for none of the surplus rather than being
    // credited twice for the floor it was given.
    let total = 0;
    for (const b of bands) if (Number.isFinite(b.frac) && b.frac > 0) total += b.frac;
    const want: number[] = bands.map((b) => {
      if (!(total > 0)) return spare / n; // no usable fracs: split evenly
      const f = Number.isFinite(b.frac) && b.frac > 0 ? b.frac / total : 0;
      return Math.max(0, f * height - 1);
    });
    let wantSum = 0;
    for (const w of want) wantSum += w;
    const scaled = want.map((w) => (wantSum > 0 ? (w * spare) / wantSum : spare / n));

    let used = 0;
    const extra = scaled.map((v) => {
      const f = Math.floor(v);
      used += f;
      return f;
    });
    // largest remainder; `a.i - b.i` keeps ties resolved by anatomical order
    const order = scaled
      .map((v, i) => ({ i, rem: v - Math.floor(v) }))
      .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; used < spare; k++) {
      const idx = order[k % n]!.i;
      extra[idx] = extra[idx]! + 1;
      used++;
    }
    for (let i = 0; i < n; i++) counts[i] = 1 + extra[i]!;
  }

  let sum = 0;
  for (const c of counts) sum += c;
  if (sum !== height) {
    throw new Error(`bandRows: allocated ${sum} rows for a rect ${height} tall`);
  }

  const out: BandRow[] = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const y1 = i === n - 1 ? height : y + counts[i]!;
    out.push({ hex: bands[i]!.hex, y0: y, y1 });
    y = y1;
  }
  return out;
}

/**
 * The row a band's CENTRE falls on — the texel a pixel assertion samples.
 *
 * Biased to the upper of the two middle rows on an even-height band, which is
 * arbitrary but must be FIXED: the acceptance test reads this exact texel, so a
 * painter and a test that disagreed by one row would turn the whole check into
 * a coin flip.
 */
export function bandCenterRow(row: BandRow): number {
  return row.y0 + Math.floor((row.y1 - row.y0 - 1) / 2);
}

/** The band covering texel row `y`, or null when `y` is outside every band. */
export function bandRowAt(rows: readonly BandRow[], y: number): BandRow | null {
  for (const r of rows) if (y >= r.y0 && y < r.y1) return r;
  return null;
}
