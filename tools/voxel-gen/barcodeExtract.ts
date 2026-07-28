/**
 * barcodeExtract — 規格 §4: read a reference image, come out with a barcode
 * DRAFT and a verdict that says how much to trust it.
 *
 * 地端 ONLY (規格 §5.2: 讀圖必須在地端). Nothing here is imported by the server;
 * the server's half of the contract is JSON in, CSS divs out.
 *
 * ── THE ONE MISTAKE THIS FILE EXISTS TO NOT MAKE ────────────────────────────
 * Per row, take the MODE colour, never the mean. Averaging a row that is half
 * red and half blue produces purple — and purple is not on the character at
 * all. Every colour this module reports is a colour that was literally read out
 * of a pixel; there is no arithmetic anywhere that can invent one. That is why
 * `rowModeColor` does a two-stage mode (coarse bucket to find the dominant
 * cluster, then the most common EXACT colour inside it) instead of a centroid.
 *
 * ── WHAT IT DOES NOT DO, AND WHY ────────────────────────────────────────────
 * 規格 §4.1 step 6 says "quantise to palette.ts's existing palette (keep the
 * Tone table)". This module reports `nearestTone` per band but does NOT snap
 * the hex to it, and that is a deliberate, load-bearing deviation:
 *
 *   the Tone ladders hold 12 skin + 12 hair + 4 metal = 28 colours. Snapping
 *   every band onto 28 swatches collapses distinct characters onto identical
 *   barcodes and squeezes bands together in Lab space — i.e. it MANUFACTURES
 *   the exact two failures (DUPLICATE and 泥巴柱) this batch was asked to
 *   detect. A guard that fires because of our own quantiser is a guard that
 *   tells the owner nothing.
 *
 * So the draft carries the true observed colour, and `nearestTone` is advice
 * for the human. The L0 editor (batch one) is where a human decides otherwise.
 *
 * ── VERDICTS ────────────────────────────────────────────────────────────────
 * Per-image guards produce PASS / SUSPECT / FAIL. DUPLICATE is intentionally
 * NOT decidable here — it is a statement about a SET of images — so it is
 * applied by `adjudicate()` over a whole batch. Keeping them apart is what lets
 * a single-image test assert a mud column without owning a corpus.
 */
import {
  BARCODE_MIN_BANDS,
  BARCODE_MUD_COLUMN_DELTA_E,
  BARCODE_SLOTS,
  BARCODE_TYPICAL_FRAC,
  HAIR_TONES,
  METAL_TONES,
  SKIN_TONES,
  type BarcodeBand,
  type BarcodeSlot,
  type BarcodeVerdict,
  type Tone,
  type VoxelBarcode,
} from "@ggd/shared/content/voxelSkin";
import {
  barcodeErrors,
  deltaE76,
  fnv1a32,
  hexToLab,
  maxPairwiseDeltaE,
  normalizeBarcode,
  presentBands,
} from "@ggd/shared/content/voxelSkin";
import type { DecodedImage } from "./pngRead";

// ---------------------------------------------------------------------------
// thresholds — every number here is 規格 §4 and is named, never inlined
// ---------------------------------------------------------------------------

/** §4.1-1: flood-fill tolerance around the corner-mode background colour. */
export const BG_FLOOD_DELTA_E = 8;
/** §4.1-4: adjacent normalised rows closer than this join the same run. */
export const RUN_MERGE_DELTA_E = 12;
/** §4.2 外框: a first/last run this close to the detected frame colour is dropped. */
export const FRAME_DROP_DELTA_E = 10;
/** §4.2 背景非單色: below this share of surviving foreground the read is FAIL. */
export const MIN_FOREGROUND_RATIO = 0.4;
/** §4.2 沒填滿畫框: bbox shorter than this share of the canvas is SUSPECT. */
export const MIN_BBOX_HEIGHT_RATIO = 0.6;
/** §4.1-2: the bbox is resampled onto this many rows before banding. */
export const NORMALISED_ROWS = 100;
/** Alpha at or below this counts as transparent, i.e. background. */
export const ALPHA_FLOOR = 128;
/** A bbox border ring must be at least this uniform to count as a drawn frame. */
export const FRAME_RING_UNIFORMITY = 0.7;

export interface ExtractOptions {
  bgFloodDeltaE?: number;
  runMergeDeltaE?: number;
  frameDropDeltaE?: number;
  minForegroundRatio?: number;
  minBboxHeightRatio?: number;
  minBands?: number;
  mudColumnDeltaE?: number;
  rows?: number;
}

interface Resolved extends Required<ExtractOptions> {}

function resolve(o: ExtractOptions | undefined): Resolved {
  return {
    bgFloodDeltaE: o?.bgFloodDeltaE ?? BG_FLOOD_DELTA_E,
    runMergeDeltaE: o?.runMergeDeltaE ?? RUN_MERGE_DELTA_E,
    frameDropDeltaE: o?.frameDropDeltaE ?? FRAME_DROP_DELTA_E,
    minForegroundRatio: o?.minForegroundRatio ?? MIN_FOREGROUND_RATIO,
    minBboxHeightRatio: o?.minBboxHeightRatio ?? MIN_BBOX_HEIGHT_RATIO,
    minBands: o?.minBands ?? BARCODE_MIN_BANDS,
    mudColumnDeltaE: o?.mudColumnDeltaE ?? BARCODE_MUD_COLUMN_DELTA_E,
    rows: o?.rows ?? NORMALISED_ROWS,
  };
}

// ---------------------------------------------------------------------------
// colour helpers — packed 0xRRGGBB throughout, hex only at the boundary
// ---------------------------------------------------------------------------

/** Packed 0xRRGGBB → `#rrggbb`, always six lowercase digits. */
export function packedToHex(p: number): string {
  return `#${(p >>> 0).toString(16).padStart(6, "0")}`;
}

function packedDeltaE(a: number, b: number): number {
  return deltaE76(packedToHex(a), packedToHex(b));
}

/**
 * The dominant EXACT colour of a bag of pixels.
 *
 * Two stages on purpose. Stage one buckets to 4 bits per channel and finds the
 * heaviest bucket — that is what makes anti-aliased edges (§4.2 反鋸齒) fall in
 * with the flat colour they surround instead of each fringe shade competing as
 * its own candidate. Stage two then returns the most frequent colour INSIDE
 * that bucket, so the answer is always a colour that exists in the image.
 *
 * Ties break toward the numerically smallest packed value, which makes the
 * whole extractor a pure function of the pixels: same file in, same hex out,
 * on every machine and every run.
 */
/** 4-bits-per-channel bucket of a packed 0xRRGGBB — the coarse stage's key.
 *  Each channel keeps its own nibble; collapsing them into one number without
 *  shifting each into its own slot would make green invisible to the bucket. */
export function coarseBucket(packed: number): number {
  return (((packed >> 20) & 0xf) << 8) | (((packed >> 12) & 0xf) << 4) | ((packed >> 4) & 0xf);
}

export function modeColor(counts: Map<number, number>): number | null {
  if (counts.size === 0) return null;
  const coarse = new Map<number, number>();
  for (const [packed, n] of counts) {
    const key = coarseBucket(packed);
    coarse.set(key, (coarse.get(key) ?? 0) + n);
  }
  let bestKey = -1;
  let bestN = -1;
  for (const [key, n] of coarse) {
    if (n > bestN || (n === bestN && key < bestKey)) {
      bestN = n;
      bestKey = key;
    }
  }
  let bestPacked = -1;
  let bestPackedN = -1;
  for (const [packed, n] of counts) {
    const key = coarseBucket(packed);
    if (key !== bestKey) continue;
    if (n > bestPackedN || (n === bestPackedN && packed < bestPacked)) {
      bestPackedN = n;
      bestPacked = packed;
    }
  }
  return bestPacked;
}

function addCount(m: Map<number, number>, packed: number, n = 1): void {
  m.set(packed, (m.get(packed) ?? 0) + n);
}

// ---------------------------------------------------------------------------
// §4.1-1 背景移除
// ---------------------------------------------------------------------------

export interface Foreground {
  /** `width * height`, 1 = foreground. */
  mask: Uint8Array;
  count: number;
  ratio: number;
  /** null when every corner was transparent. */
  bgColor: number | null;
}

function packedAt(img: DecodedImage, x: number, y: number): number {
  const o = (y * img.width + x) * 4;
  return (img.rgba[o]! << 16) | (img.rgba[o + 1]! << 8) | img.rgba[o + 2]!;
}

function alphaAt(img: DecodedImage, x: number, y: number): number {
  return img.rgba[(y * img.width + x) * 4 + 3]!;
}

/**
 * §4.1-1: corner-mode background colour, then flood-fill inward from every edge
 * pixel with ΔE ≤ tolerance.
 *
 * FLOOD-FILL, NOT "every pixel that matches the background colour". A white
 * shirt on a white background must stay on the character: it is not reachable
 * from the edge without crossing the outline, so it survives. Removing by
 * colour alone would punch a hole through the middle of the figure.
 */
export function separateForeground(img: DecodedImage, tolerance = BG_FLOOD_DELTA_E): Foreground {
  const { width: w, height: h } = img;
  const n = w * h;
  const mask = new Uint8Array(n).fill(1);

  // corners in a FIXED order, so a 2-2 tie resolves the same way every run
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const cornerCounts = new Map<number, number>();
  let transparentCorners = 0;
  for (const [x, y] of corners) {
    if (alphaAt(img, x, y) <= ALPHA_FLOOR) transparentCorners++;
    else addCount(cornerCounts, packedAt(img, x, y));
  }
  const bgColor = transparentCorners >= 3 ? null : modeColor(cornerCounts);

  // transparency is background unconditionally — no flood needed to reach it
  for (let i = 0; i < n; i++) {
    if (img.rgba[i * 4 + 3]! <= ALPHA_FLOOR) mask[i] = 0;
  }

  if (bgColor !== null) {
    // ΔE is expensive; memoise per distinct packed colour
    const matches = new Map<number, boolean>();
    const isBg = (packed: number): boolean => {
      const hit = matches.get(packed);
      if (hit !== undefined) return hit;
      const v = packedDeltaE(packed, bgColor) <= tolerance;
      matches.set(packed, v);
      return v;
    };
    const stack: number[] = [];
    const push = (x: number, y: number): void => {
      const i = y * w + x;
      if (mask[i] === 0) return;
      if (!isBg(packedAt(img, x, y))) return;
      mask[i] = 0;
      stack.push(i);
    };
    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
  }

  let count = 0;
  for (let i = 0; i < n; i++) count += mask[i]!;
  return { mask, count, ratio: count / n, bgColor };
}

export interface Bbox {
  left: number;
  top: number;
  right: number; // inclusive
  bottom: number; // inclusive
  width: number;
  height: number;
}

export function foregroundBbox(img: DecodedImage, fg: Foreground): Bbox | null {
  const { width: w, height: h } = img;
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fg.mask[y * w + x] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

// ---------------------------------------------------------------------------
// §4.1-2,3 正規化到 N 列，每列取眾數色
// ---------------------------------------------------------------------------

export interface RowRead {
  /** null when the normalised row caught no foreground pixels at all. */
  color: number | null;
  /** foreground pixels the row was decided from. */
  pixels: number;
  /** exact-colour histogram, carried forward so run merging stays exact. */
  counts: Map<number, number>;
}

export function normalisedRows(
  img: DecodedImage,
  fg: Foreground,
  box: Bbox,
  rows = NORMALISED_ROWS,
): RowRead[] {
  const out: RowRead[] = [];
  for (let i = 0; i < rows; i++) {
    // Half-open source span per output row. `y1 = max(y1, y0 + 1)` matters when
    // the bbox is shorter than `rows`: without it the tail rows would be empty
    // and a short icon would silently lose its lower bands.
    const y0 = box.top + Math.floor((i * box.height) / rows);
    let y1 = box.top + Math.floor(((i + 1) * box.height) / rows);
    if (y1 <= y0) y1 = y0 + 1;
    if (y1 > box.bottom + 1) y1 = box.bottom + 1;
    const counts = new Map<number, number>();
    let pixels = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = box.left; x <= box.right; x++) {
        if (fg.mask[y * img.width + x] === 0) continue;
        addCount(counts, packedAt(img, x, y));
        pixels++;
      }
    }
    out.push({ color: modeColor(counts), pixels, counts });
  }
  return out;
}

// ---------------------------------------------------------------------------
// §4.1-4 相鄰列併段
// ---------------------------------------------------------------------------

export interface Run {
  color: number;
  /** how many normalised rows the run owns. */
  rows: number;
  /** first normalised row index (for ordering and the frame guard). */
  fromRow: number;
  counts: Map<number, number>;
}

/**
 * Merge adjacent rows whose mode colours are within ΔE.
 *
 * A row is compared against the run's representative AS IT STANDS, not against
 * the previous row: comparing pairwise lets a slow gradient walk arbitrarily far
 * (every step under 12, total 60), which would swallow a real band boundary.
 */
export function mergeRows(rows: readonly RowRead[], mergeDeltaE = RUN_MERGE_DELTA_E): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.color === null) continue; // an empty row belongs to no band
    const last = runs[runs.length - 1];
    if (last && packedDeltaE(r.color, last.color) < mergeDeltaE) {
      last.rows++;
      for (const [p, n] of r.counts) addCount(last.counts, p, n);
      last.color = modeColor(last.counts)!;
      continue;
    }
    runs.push({ color: r.color, rows: 1, fromRow: i, counts: new Map(r.counts) });
  }
  return runs;
}

/** Merge the adjacent pair with the smallest ΔE, repeatedly, until `max` remain.
 *  Used only when a busy image yields more runs than there are slots: dropping
 *  the least distinct boundary loses less of the character than dropping a band
 *  (§2.1 — 細帶不可當雜訊丟掉). */
export function reduceRuns(runs: Run[], max: number): Run[] {
  const out = runs.slice();
  while (out.length > max) {
    let at = 0;
    let best = Infinity;
    for (let i = 0; i + 1 < out.length; i++) {
      const d = packedDeltaE(out[i]!.color, out[i + 1]!.color);
      if (d < best) {
        best = d;
        at = i;
      }
    }
    const a = out[at]!;
    const b = out[at + 1]!;
    const counts = new Map(a.counts);
    for (const [p, n] of b.counts) addCount(counts, p, n);
    out.splice(at, 2, {
      color: modeColor(counts)!,
      rows: a.rows + b.rows,
      fromRow: a.fromRow,
      counts,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// §4.2 外框守衛
// ---------------------------------------------------------------------------

/**
 * The colour of a drawn frame around the figure, or null when there isn't one.
 *
 * Reads the one-pixel ring of the BBOX (not of the canvas): a w3x icon's border
 * survives background removal because it is opaque and unlike the paper, so it
 * ends up as the outermost foreground. The uniformity test is what stops this
 * from firing on a character who merely happens to have a dark silhouette — a
 * real frame is one colour nearly all the way round.
 */
export function detectFrameColor(
  img: DecodedImage,
  fg: Foreground,
  box: Bbox,
  tolerance = BG_FLOOD_DELTA_E,
  uniformity = FRAME_RING_UNIFORMITY,
): number | null {
  const counts = new Map<number, number>();
  const ring: number[] = [];
  const take = (x: number, y: number): void => {
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return;
    if (fg.mask[y * img.width + x] === 0) return;
    const p = packedAt(img, x, y);
    addCount(counts, p);
    ring.push(p);
  };
  for (let x = box.left; x <= box.right; x++) {
    take(x, box.top);
    take(x, box.bottom);
  }
  for (let y = box.top + 1; y < box.bottom; y++) {
    take(box.left, y);
    take(box.right, y);
  }
  if (ring.length === 0) return null;
  const mode = modeColor(counts);
  if (mode === null) return null;
  let near = 0;
  for (const p of ring) if (packedDeltaE(p, mode) <= tolerance) near++;
  return near / ring.length >= uniformity ? mode : null;
}

// ---------------------------------------------------------------------------
// §4.1-5 對齊十一槽
// ---------------------------------------------------------------------------

/** Mid-point of each slot's typical share, and the running centre of the figure
 *  those mid-points imply. Used as the positional prior in the assignment cost
 *  so head runs are drawn toward head slots. */
const SLOT_PRIOR = (() => {
  const mids = BARCODE_SLOTS.map((s) => {
    const [lo, hi] = BARCODE_TYPICAL_FRAC[s];
    return (lo + hi) / 2;
  });
  const total = mids.reduce((a, b) => a + b, 0);
  const centres: number[] = [];
  let acc = 0;
  for (const m of mids) {
    centres.push((acc + m / 2) / total);
    acc += m;
  }
  return { mids, centres };
})();

/** How hard the positional prior pulls, relative to the frac-range cost. Both
 *  are measured in "share of figure height", so 1 weighs them equally. */
export const SLOT_POSITION_WEIGHT = 1;

function slotCost(frac: number, centre: number, slotIndex: number): number {
  const [lo, hi] = BARCODE_TYPICAL_FRAC[BARCODE_SLOTS[slotIndex]!];
  const fracCost = frac < lo ? lo - frac : frac > hi ? frac - hi : 0;
  return fracCost + SLOT_POSITION_WEIGHT * Math.abs(centre - SLOT_PRIOR.centres[slotIndex]!);
}

/**
 * Assign ordered runs to the eleven ordered slots, minimising total prior cost,
 * WITHOUT ever letting a lower run take a higher slot.
 *
 * 規格 §4.1-5 calls this "匈牙利式" but a free Hungarian assignment is wrong
 * here: the slot list is anatomy, so an assignment that puts the shoe band above
 * the hair band is not a cheaper answer, it is a broken character. This is
 * therefore an order-preserving DP over (run, slot) — exact, O(runs × 11), and
 * deterministic (ties keep the lower slot index).
 */
export function assignSlots(fracs: readonly number[]): BarcodeSlot[] {
  const k = fracs.length;
  const S = BARCODE_SLOTS.length;
  if (k === 0 || k > S) return [];
  const centres: number[] = [];
  let acc = 0;
  for (const f of fracs) {
    centres.push(acc + f / 2);
    acc += f;
  }
  const INF = Infinity;
  // best[i][s] — run i placed at slot s, runs 0..i-1 at strictly smaller slots
  const best: number[][] = [];
  const from: number[][] = [];
  for (let i = 0; i < k; i++) {
    best.push(new Array<number>(S).fill(INF));
    from.push(new Array<number>(S).fill(-1));
  }
  for (let s = 0; s < S; s++) best[0]![s] = slotCost(fracs[0]!, centres[0]!, s);
  for (let i = 1; i < k; i++) {
    let runMin = INF;
    let runArg = -1;
    for (let s = 0; s < S; s++) {
      if (s > 0) {
        const prev = best[i - 1]![s - 1]!;
        if (prev < runMin) {
          runMin = prev;
          runArg = s - 1;
        }
      }
      if (runArg < 0) continue;
      best[i]![s] = runMin + slotCost(fracs[i]!, centres[i]!, s);
      from[i]![s] = runArg;
    }
  }
  let endMin = INF;
  let endArg = -1;
  for (let s = 0; s < S; s++) {
    if (best[k - 1]![s]! < endMin) {
      endMin = best[k - 1]![s]!;
      endArg = s;
    }
  }
  if (endArg < 0) return [];
  const slots: BarcodeSlot[] = new Array(k);
  let s = endArg;
  for (let i = k - 1; i >= 0; i--) {
    slots[i] = BARCODE_SLOTS[s]!;
    s = from[i]![s]!;
  }
  return slots;
}

// ---------------------------------------------------------------------------
// §4.1-6 nearest Tone (advisory — see the file header for why it is not applied)
// ---------------------------------------------------------------------------

const TONE_HEXES: ReadonlyArray<readonly [string, string]> = Object.freeze(
  ([] as Array<readonly [string, string]>).concat(
    ...([
      ["skin", SKIN_TONES],
      ["hair", HAIR_TONES],
      ["metal", METAL_TONES],
    ] as Array<[string, readonly Tone[]]>).map(([family, tones]) =>
      tones.map((t) => {
        const [r, g, b] = t[1];
        const hex =
          "#" +
          [r, g, b]
            .map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0"))
            .join("");
        return [`${family}:${t[0]}`, hex] as const;
      }),
    ),
  ),
);

export interface ToneMatch {
  name: string;
  hex: string;
  deltaE: number;
}

/** Closest entry in the existing Tone ladders. Reported, never substituted. */
export function nearestTone(hex: string): ToneMatch {
  let best = TONE_HEXES[0]!;
  let bestD = Infinity;
  for (const t of TONE_HEXES) {
    const d = deltaE76(hex, t[1]);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return { name: best[0], hex: best[1], deltaE: bestD };
}

// ---------------------------------------------------------------------------
// the draft
// ---------------------------------------------------------------------------

export interface ExtractMetrics {
  foregroundRatio: number;
  bboxHeightRatio: number;
  maxPairwiseDeltaE: number;
  rawRunCount: number;
  bandCount: number;
  framesDropped: number;
  /** Distinct EXACT pixel colours in the foreground. The gap between this and
   *  `bandCount + framesDropped` is the anti-aliasing/gradient the mode + ΔE
   *  merge absorbed — the §4.2 反鋸齒 auto-fix, measured. */
  distinctColors: number;
}

export interface ExtractDraft {
  championId: string;
  refImage: string;
  /** null only when the image could not be read far enough to produce one. */
  barcode: VoxelBarcode | null;
  /** PASS / SUSPECT / FAIL. Never DUPLICATE — that is `adjudicate`'s call. */
  verdict: BarcodeVerdict;
  reasons: string[];
  metrics: ExtractMetrics;
  /** Fingerprint of the produced barcode; "" when there is none. */
  hash: string;
  tones: Array<{ slot: BarcodeSlot; hex: string; tone: ToneMatch }>;
}

const EMPTY_METRICS: ExtractMetrics = {
  foregroundRatio: 0,
  bboxHeightRatio: 0,
  maxPairwiseDeltaE: 0,
  rawRunCount: 0,
  bandCount: 0,
  framesDropped: 0,
  distinctColors: 0,
};

/**
 * Stable fingerprint of a barcode's VISIBLE content — slot, colour and rounded
 * share, in anatomical order.
 *
 * Rounded to 1e-4 so two byte-identical icon files hash the same despite float
 * noise, and 64 bits wide — FNV over the canon, then FNV over a SALTED AND
 * REVERSED canon, which is a genuinely different function of the same input
 * rather than the same number written twice. A 32-bit fingerprint over ~140
 * items carries a real birthday risk, and a false DUPLICATE costs the owner a
 * manual review of a barcode that was fine.
 */
export const BARCODE_FINGERPRINT_SALT = "ggd-barcode-fp@1";

export function barcodeFingerprint(barcode: VoxelBarcode): string {
  const canon = presentBands(barcode.bands)
    .map((b) => `${b.slot}:${b.hex.toLowerCase()}:${b.frac.toFixed(4)}`)
    .join("|");
  const a = fnv1a32(canon);
  const b = fnv1a32(BARCODE_FINGERPRINT_SALT + " " + [...canon].reverse().join(""));
  return (
    (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0")
  );
}

/** FAIL beats DUPLICATE beats SUSPECT beats PASS. An unusable read is more
 *  actionable than "two of these are the same". */
const VERDICT_RANK: Readonly<Record<BarcodeVerdict, number>> = Object.freeze({
  PASS: 0,
  SUSPECT: 1,
  DUPLICATE: 2,
  FAIL: 3,
});

export function worstVerdict(a: BarcodeVerdict, b: BarcodeVerdict): BarcodeVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

/**
 * 規格 §4 end to end for ONE image.
 *
 * Returns a draft even when the verdict is FAIL, whenever a barcode could be
 * built at all: the owner reviewing a FAIL needs to see WHAT the extractor
 * thought it saw, or the verdict is unfalsifiable.
 */
export function extractBarcode(
  championId: string,
  refImage: string,
  img: DecodedImage,
  options?: ExtractOptions,
): ExtractDraft {
  const opt = resolve(options);
  const reasons: string[] = [];
  let verdict: BarcodeVerdict = "PASS";

  const fg = separateForeground(img, opt.bgFloodDeltaE);
  const foregroundRatio = fg.ratio;

  // ── guard 1/6 · 背景非單色 → FAIL ────────────────────────────────────────
  if (foregroundRatio < opt.minForegroundRatio) {
    reasons.push(
      `前景僅 ${(foregroundRatio * 100).toFixed(1)}%（< ${(opt.minForegroundRatio * 100).toFixed(0)}%）` +
        `—— 背景不是單色，去背把角色一起吃掉了`,
    );
    verdict = worstVerdict(verdict, "FAIL");
  }

  const box = foregroundBbox(img, fg);
  if (!box) {
    reasons.push("去背後沒有任何前景像素");
    return {
      championId,
      refImage,
      barcode: null,
      verdict: "FAIL",
      reasons,
      metrics: { ...EMPTY_METRICS, foregroundRatio },
      hash: "",
      tones: [],
    };
  }

  const bboxHeightRatio = box.height / img.height;
  // ── guard 2/6 · 沒填滿畫框 → SUSPECT ────────────────────────────────────
  if (bboxHeightRatio < opt.minBboxHeightRatio) {
    reasons.push(
      `bbox 只占畫框高度 ${(bboxHeightRatio * 100).toFixed(1)}%（< ${(opt.minBboxHeightRatio * 100).toFixed(0)}%）` +
        ` —— §2.2 的佔比先驗對這張圖不成立`,
    );
    verdict = worstVerdict(verdict, "SUSPECT");
  }

  const rows = normalisedRows(img, fg, box, opt.rows);
  let runs = mergeRows(rows, opt.runMergeDeltaE);
  const rawRunCount = runs.length;
  // How many DIFFERENT colours the artwork actually contains. Compared against
  // the band count below, this is the anti-aliasing guard's receipt.
  const seen = new Set<number>();
  for (const r of rows) for (const p of r.counts.keys()) seen.add(p);
  const distinctColors = seen.size;

  // ── guard 4/6 · 外框 → 自動修（首末帶丟棄）──────────────────────────────
  const frameColor = detectFrameColor(img, fg, box, opt.bgFloodDeltaE);
  let framesDropped = 0;
  if (frameColor !== null && runs.length >= 3) {
    if (packedDeltaE(runs[0]!.color, frameColor) < opt.frameDropDeltaE) {
      runs = runs.slice(1);
      framesDropped++;
    }
    if (runs.length >= 2 && packedDeltaE(runs[runs.length - 1]!.color, frameColor) < opt.frameDropDeltaE) {
      runs = runs.slice(0, -1);
      framesDropped++;
    }
    if (framesDropped > 0) {
      reasons.push(
        `外框 ${packedToHex(frameColor)}：丟棄 ${framesDropped} 條與框色 ΔE < ${opt.frameDropDeltaE} 的首/末帶（自動修）`,
      );
    }
  }

  runs = reduceRuns(runs, BARCODE_SLOTS.length);
  const totalRunRows = runs.reduce((n, r) => n + r.rows, 0);
  if (runs.length === 0 || totalRunRows === 0) {
    reasons.push("併段後沒有任何色帶");
    return {
      championId,
      refImage,
      barcode: null,
      verdict: "FAIL",
      reasons,
      metrics: { ...EMPTY_METRICS, foregroundRatio, bboxHeightRatio, rawRunCount, distinctColors },
      hash: "",
      tones: [],
    };
  }

  const fracs = runs.map((r) => r.rows / totalRunRows);
  const slots = assignSlots(fracs);
  const bands = {} as Record<BarcodeSlot, BarcodeBand | null>;
  for (const s of BARCODE_SLOTS) bands[s] = null;
  for (let i = 0; i < slots.length; i++) {
    bands[slots[i]!] = { hex: packedToHex(runs[i]!.color), frac: fracs[i]! };
  }

  // faceColors: taken from the DARKEST band actually present, so the draft never
  // carries a colour that is not on the character. It is still a guess about
  // WHICH colour the eyes are, hence the reason line.
  const present = BARCODE_SLOTS.map((s) => bands[s]).filter((b): b is BarcodeBand => b !== null);
  let darkest = present[0]!.hex;
  let darkestL = hexToLab(darkest)[0];
  for (const b of present) {
    const l = hexToLab(b.hex)[0];
    if (l < darkestL) {
      darkestL = l;
      darkest = b.hex;
    }
  }

  let barcode: VoxelBarcode = {
    v: 1,
    championId,
    bands,
    // The barcode is a mid-axis section, so the sleeve rule (§2.4) is simply not
    // in the image. Drafted as `long` and flagged rather than guessed silently.
    sleeve: "long",
    faceColors: { eye: darkest, nose: null, mouth: darkest },
    source: "extracted",
    extraction: {
      refImage,
      verdict: "PASS",
      reasons: [],
      maxPairwiseDeltaE: 0,
      foregroundRatio,
    },
  };
  barcode = normalizeBarcode(barcode);
  reasons.push("sleeve 與 faceColors 無法從中軸條碼推得：草稿為 long + 最暗帶，需人工確認");

  const maxDe = maxPairwiseDeltaE(barcode);
  const bandCount = presentBands(barcode.bands).length;

  // ── guard 3/6 · 反鋸齒 → 自動修（眾數 + ΔE 併段）────────────────────────
  // Reported only when colours were genuinely absorbed: `bandCount +
  // framesDropped` is what a clean, hard-edged figure yields, so any excess is
  // fringe/gradient shades that the mode + ΔE merge kept OUT of the barcode.
  const absorbed = distinctColors - (bandCount + framesDropped);
  if (absorbed > 0) {
    reasons.push(
      `反鋸齒/漸層：${distinctColors} 種像素顏色收斂成 ${bandCount} 條帶，` +
        `${absorbed} 種中間色被眾數 + ΔE<${opt.runMergeDeltaE} 併段吸收（自動修）`,
    );
  }

  // ── guard 5/6 · 泥巴柱 → FAIL ───────────────────────────────────────────
  if (maxDe < opt.mudColumnDeltaE) {
    reasons.push(
      `帶間最大 ΔE ${maxDe.toFixed(2)} < ${opt.mudColumnDeltaE} —— 一根泥巴柱，不是角色`,
    );
    verdict = worstVerdict(verdict, "FAIL");
  }

  // ── guard 6a/6 · 帶數過少 → SUSPECT ─────────────────────────────────────
  if (bandCount < opt.minBands) {
    reasons.push(`只抽出 ${bandCount} 條有效帶（< ${opt.minBands}）`);
    verdict = worstVerdict(verdict, "SUSPECT");
  }

  // The batch-one contract's own validator, minus the mud column it already
  // reported above. Anything it still objects to means the draft would not be
  // paintable, which is exactly what SUSPECT is for.
  for (const issue of barcodeErrors(barcode)) {
    if (issue.code === "mud-column") continue;
    reasons.push(`契約檢查：${issue.message}`);
    verdict = worstVerdict(verdict, "SUSPECT");
  }

  const tones = presentBands(barcode.bands).map((b) => ({
    slot: b.slot,
    hex: b.hex,
    tone: nearestTone(b.hex),
  }));

  const finished: VoxelBarcode = {
    ...barcode,
    extraction: { ...barcode.extraction!, verdict, reasons: reasons.slice(), maxPairwiseDeltaE: maxDe },
  };

  return {
    championId,
    refImage,
    barcode: finished,
    verdict,
    reasons,
    metrics: {
      foregroundRatio,
      bboxHeightRatio,
      maxPairwiseDeltaE: maxDe,
      rawRunCount,
      bandCount,
      framesDropped,
      distinctColors,
    },
    hash: barcodeFingerprint(finished),
    tones,
  };
}

// ---------------------------------------------------------------------------
// §4.2 圖示重複 —— a statement about a SET, so it lives here and not above
// ---------------------------------------------------------------------------

export interface VerdictRow extends ExtractDraft {
  /** The FIRST champion id sharing this fingerprint; null when unique. */
  duplicateOf: string | null;
}

/**
 * ── guard 6b/6 · 圖示重複 → DUPLICATE ──────────────────────────────────────
 *
 * NOT DEFENSIVE PROGRAMMING. `voxelSkin/generate.ts`'s own header records the
 * measurement: 141 icon files, 87 distinct byte-hashes, 24 duplicate groups —
 * one file is simultaneously two Pikachus and 曹操孟德. Extracting the corpus
 * WILL produce identical barcodes; this is the guard that stops them being
 * shipped as if they described different characters.
 *
 * Order matters and is preserved: the first row carrying a fingerprint keeps
 * its own verdict and every later row pointing at it is marked, so the report
 * names one representative instead of flagging a group with no anchor.
 */
export function adjudicate(drafts: readonly ExtractDraft[]): VerdictRow[] {
  const firstSeen = new Map<string, string>();
  const out: VerdictRow[] = [];
  for (const d of drafts) {
    if (!d.hash) {
      out.push({ ...d, duplicateOf: null });
      continue;
    }
    const owner = firstSeen.get(d.hash);
    if (owner === undefined) {
      firstSeen.set(d.hash, d.championId);
      out.push({ ...d, duplicateOf: null });
      continue;
    }
    const reasons = [...d.reasons, `條碼 hash ${d.hash} 與 ${owner} 相同 —— 圖示重複，強制人工`];
    const verdict = worstVerdict(d.verdict, "DUPLICATE");
    out.push({
      ...d,
      duplicateOf: owner,
      verdict,
      reasons,
      barcode: d.barcode
        ? { ...d.barcode, extraction: { ...d.barcode.extraction!, verdict, reasons } }
        : null,
    });
  }
  return out;
}
