/**
 * voxelSkin/barcode — the pure maths of 特徵生成 (docs/_體素特徵生成規格.md).
 *
 * Everything here is a total function of its argument: no clock, no randomness,
 * no I/O, no mutation of the input. That is deliberate — this module is the ONE
 * contract between two halves that must never learn about each other:
 *
 *   後台 (server)  edits JSON, previews it as a stack of CSS divs, never
 *                  touches a pixel;
 *   地端 (local)   reads the same JSON, paints the atlas, never decides a
 *                  colour.
 *
 * So this file has to be runnable in both, and identical in both.
 *
 * WHAT `barcodeToParts` IS FOR, AND WHY IT RE-NORMALISES.
 * A band's authored `frac` is a share of the WHOLE FIGURE — that is what makes
 * the admin preview literally the same object as the skin. But the voxel body
 * is three boxes with FIXED heights (head 8, torso 12, legs 12), so the 3D path
 * cannot honour cross-part ratios: whatever share of total height the author
 * gave the head, the head box is still 8 voxels tall. `barcodeToParts` therefore
 * re-normalises inside each part and reports each band's span as a 0..1 offset
 * DOWN THAT PART. Those spans are what the painter turns into texel rows, and
 * they are the thing worth asserting on — "#E8112D covers 44.4%..55.6% of the
 * head" is a claim about the picture; "bands has 11 keys" is not.
 */
import {
  BARCODE_MIN_BANDS,
  BARCODE_MUD_COLUMN_DELTA_E,
  BARCODE_PARTS,
  BARCODE_SLOT_PART,
  BARCODE_SLOTS,
  BARCODE_TYPICAL_FRAC,
  type BarcodeBand,
  type BarcodeBands,
  type BarcodePart,
  type BarcodeSlot,
  type VoxelBarcode,
} from "./types";

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** True for a strict `#rrggbb`. Three-digit shorthand is REJECTED on purpose:
 *  the seed data and the extractor both emit six, and silently accepting a
 *  second spelling means two hexes that render the same never compare equal. */
export function isBarcodeHex(hex: unknown): hex is string {
  return typeof hex === "string" && HEX_RE.test(hex);
}

/** `#rrggbb` → 0..255 triple. Throws on anything else — a malformed hex must
 *  never quietly become black, which is a real colour a character can wear. */
export function hexToRgb255(hex: string): readonly [number, number, number] {
  if (!isBarcodeHex(hex)) throw new Error(`barcode: not a #rrggbb colour: ${JSON.stringify(hex)}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB channel (0..1) → linear. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB → XYZ, D65 2°. Rows in X, Y, Z order. */
const SRGB_TO_XYZ = Object.freeze([
  Object.freeze([0.4124564, 0.3575761, 0.1804375] as const),
  Object.freeze([0.2126729, 0.7151522, 0.072175] as const),
  Object.freeze([0.0193339, 0.119192, 0.9503041] as const),
] as const);

/**
 * The white point, taken as the MATRIX'S OWN row sums rather than the published
 * (95.047, 100, 108.883).
 *
 * Those two disagree in the 7th digit — the published Y row sums to 1.0000001 —
 * and that tiny disagreement is enough to make pure white land at L* =
 * 100.0000039 instead of 100. Deriving the white from the same matrix makes
 * `f(white) = 1` exact by construction, so white is exactly (100, 0, 0) and the
 * black↔white distance is exactly 100 — an anchor a test can pin without
 * having to trust this function.
 */
const WHITE_D65 = Object.freeze([
  (SRGB_TO_XYZ[0][0] + SRGB_TO_XYZ[0][1] + SRGB_TO_XYZ[0][2]) * 100,
  (SRGB_TO_XYZ[1][0] + SRGB_TO_XYZ[1][1] + SRGB_TO_XYZ[1][2]) * 100,
  (SRGB_TO_XYZ[2][0] + SRGB_TO_XYZ[2][1] + SRGB_TO_XYZ[2][2]) * 100,
] as const);

function labF(t: number): number {
  // 6/29 cubed; the linear tail keeps the function differentiable at the join.
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/** `#rrggbb` → CIE L*a*b* (D65, 2°). */
export function hexToLab(hex: string): readonly [number, number, number] {
  const [r8, g8, b8] = hexToRgb255(hex);
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);
  const x = (SRGB_TO_XYZ[0][0] * r + SRGB_TO_XYZ[0][1] * g + SRGB_TO_XYZ[0][2] * b) * 100;
  const y = (SRGB_TO_XYZ[1][0] * r + SRGB_TO_XYZ[1][1] * g + SRGB_TO_XYZ[1][2] * b) * 100;
  const z = (SRGB_TO_XYZ[2][0] * r + SRGB_TO_XYZ[2][1] * g + SRGB_TO_XYZ[2][2] * b) * 100;
  const fx = labF(x / WHITE_D65[0]);
  const fy = labF(y / WHITE_D65[1]);
  const fz = labF(z / WHITE_D65[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * ΔE*ab (CIE76) between two `#rrggbb`.
 *
 * CIE76 and not CIE2000 because the spec's thresholds (8 for background
 * flood-fill, 12 for run merging, 25 for the mud column) are CIE76-scaled, and
 * because the anchor CIE76 gives for free — pure black to pure white is exactly
 * 100 — is a number a test can pin without trusting this implementation.
 */
export function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ---------------------------------------------------------------------------
// reading a barcode
// ---------------------------------------------------------------------------

/** One present band with its slot, in anatomical order. */
export interface PresentBand {
  slot: BarcodeSlot;
  hex: string;
  frac: number;
}

/**
 * The present bands, ALWAYS in `BARCODE_SLOTS` order (top of head → sole).
 * Never sorted by frac, never de-duplicated by hex.
 */
export function presentBands(bands: BarcodeBands): PresentBand[] {
  const out: PresentBand[] = [];
  for (const slot of BARCODE_SLOTS) {
    const band = bands[slot];
    if (band) out.push({ slot, hex: band.hex, frac: band.frac });
  }
  return out;
}

/**
 * Largest pairwise ΔE among the PRESENT bands — 規格 §4.2's core guard.
 *
 * Fewer than two bands ⇒ 0, which correctly reads as "cannot pass the mud-column
 * floor": a one-colour figure IS a mud column.
 */
export function maxPairwiseDeltaE(barcode: VoxelBarcode): number {
  const present = presentBands(barcode.bands).filter((b) => isBarcodeHex(b.hex));
  let max = 0;
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const d = deltaE76(present[i]!.hex, present[j]!.hex);
      if (d > max) max = d;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// normalisation
// ---------------------------------------------------------------------------

/** Total of the present bands' `frac`. */
export function totalFrac(bands: BarcodeBands): number {
  let sum = 0;
  for (const slot of BARCODE_SLOTS) {
    const band = bands[slot];
    if (band) sum += band.frac;
  }
  return sum;
}

/** Every key rebuilt, absent slots still `null`, band objects always fresh. */
function rebuildBands(make: (slot: BarcodeSlot, band: BarcodeBand) => BarcodeBand, src: BarcodeBands): BarcodeBands {
  const out = {} as Record<BarcodeSlot, BarcodeBand | null>;
  for (const slot of BARCODE_SLOTS) {
    const band = src[slot];
    // A FRESH object per slot, unconditionally. `top` and `pants` may hold the
    // same hex; they must never end up as the same object, or a downstream
    // identity check ("is this the same band?") would silently weld the hip.
    out[slot] = band ? make(slot, band) : null;
  }
  return out;
}

/**
 * Scale the present bands so they sum to exactly 1.0, preserving their ratios,
 * their slots, their nulls and their ORDER.
 *
 * Throws when the total is not a positive finite number: a barcode whose bands
 * all carry frac 0 has no ratios to preserve, and returning it unchanged would
 * ship a figure with zero-height bands that renders as whatever the last band
 * happened to be.
 */
export function normalizeBarcode(barcode: VoxelBarcode): VoxelBarcode {
  const total = totalFrac(barcode.bands);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(
      `barcode ${barcode.championId}: cannot normalise, present bands total ${total}`,
    );
  }
  return {
    ...barcode,
    bands: rebuildBands((_slot, band) => ({ hex: band.hex, frac: band.frac / total }), barcode.bands),
  };
}

// ---------------------------------------------------------------------------
// slot → part dispatch
// ---------------------------------------------------------------------------

/**
 * A band as the painter wants it: a colour and the span it owns on its part,
 * measured 0 (top of the part) to 1 (bottom of the part).
 */
export interface PartBand {
  slot: BarcodeSlot;
  hex: string;
  /** Share of THIS part's height. The part's bands sum to 1. */
  frac: number;
  /** Top edge within the part, 0..1. */
  from: number;
  /** Bottom edge within the part, 0..1. The last band's `to` is exactly 1. */
  to: number;
}

export type BarcodeParts = Readonly<Record<BarcodePart, readonly PartBand[]>>;

/**
 * Dispatch the eleven slots onto head / torso / legs and re-normalise INSIDE
 * each part (規格 §7).
 *
 * Cross-part ratios are discarded here, and that is correct rather than lossy:
 * the three boxes have fixed voxel heights, so "the head is 34% of this
 * character" is a fact about the reference image and the CSS preview, never
 * about the mesh. What survives — and what the picture actually depends on — is
 * the ratio WITHIN a part: Luffy's hat band is 11.1% of his head no matter how
 * tall his head box is.
 *
 * A part with no bands gets an empty list rather than a filler band. Silence is
 * the honest answer, and `validateBarcode` reports it as an error; inventing a
 * grey default here would make an unpaintable barcode look paintable.
 */
export function barcodeToParts(barcode: VoxelBarcode): BarcodeParts {
  const buckets: Record<BarcodePart, PresentBand[]> = { head: [], torso: [], legs: [] };
  // BARCODE_SLOTS order in, so each bucket comes out in anatomical order.
  for (const band of presentBands(barcode.bands)) {
    buckets[BARCODE_SLOT_PART[band.slot]].push(band);
  }

  const out = {} as Record<BarcodePart, readonly PartBand[]>;
  for (const part of BARCODE_PARTS) {
    const bucket = buckets[part];
    const total = bucket.reduce((n, b) => n + b.frac, 0);
    if (bucket.length === 0 || !(total > 0)) {
      out[part] = Object.freeze([] as PartBand[]);
      continue;
    }
    const rows: PartBand[] = [];
    let cursor = 0;
    for (let i = 0; i < bucket.length; i++) {
      const b = bucket[i]!;
      const frac = b.frac / total;
      // The last band's bottom edge is pinned to exactly 1 rather than left to
      // accumulated float error — a 1e-16 gap at the sole is a transparent row
      // of texels, which is a hole in the model, not a rounding detail.
      const to = i === bucket.length - 1 ? 1 : cursor + frac;
      rows.push({ slot: b.slot, hex: b.hex, frac, from: cursor, to });
      cursor = to;
    }
    out[part] = Object.freeze(rows);
  }
  return Object.freeze(out);
}

/**
 * The band covering normalised depth `t` (0 = top of the part, 1 = bottom).
 *
 * Half-open `[from, to)` per band, with the bottom band claiming t === 1, so
 * every t in [0,1] maps to exactly one band and no boundary is owned twice.
 * This is the function a pixel assertion should go through: it answers "what
 * colour is 30% of the way down the legs" — which is a question about the
 * picture.
 */
export function bandAtDepth(parts: BarcodeParts, part: BarcodePart, t: number): PartBand | null {
  const rows = parts[part];
  if (rows.length === 0) return null;
  if (!(t >= 0) || t > 1) return null;
  for (const row of rows) {
    if (t >= row.from && t < row.to) return row;
  }
  return rows[rows.length - 1] ?? null;
}

/**
 * Arm colours implied by `sleeve` (規格 §2.4). The arms are not bands — the
 * barcode is a mid-axis section — so they are derived, and `upper`/`lower` are
 * the two halves of each arm box.
 *
 * Returns `null` when the barcode lacks the colour the rule needs (no `top` for
 * a long sleeve, no `face` for a bare arm) rather than substituting one.
 */
export function sleeveColors(barcode: VoxelBarcode): { upper: string; lower: string } | null {
  const top = barcode.bands.top?.hex ?? null;
  const skin = barcode.bands.face?.hex ?? null;
  switch (barcode.sleeve) {
    case "long":
      return top ? { upper: top, lower: top } : null;
    case "short":
      return top && skin ? { upper: top, lower: skin } : null;
    case "none":
      return skin ? { upper: skin, lower: skin } : null;
  }
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

export type BarcodeIssueCode =
  /** a band's `hex` is not `#rrggbb` */
  | "bad-hex"
  /** a present band has frac <= 0 or non-finite */
  | "bad-frac"
  /** present bands do not sum to 1.0 — run `normalizeBarcode` */
  | "not-normalized"
  /** head, torso or legs has no band at all — that box would go unpainted */
  | "missing-band"
  /** fewer than BARCODE_MIN_BANDS present (§4.2 SUSPECT) */
  | "too-few-bands"
  /** every band is within BARCODE_MUD_COLUMN_DELTA_E of every other (§4.2 FAIL) */
  | "mud-column"
  /** outside §2.2's typical range — advisory only, see BARCODE_TYPICAL_FRAC */
  | "frac-out-of-range"
  /** `source: "extracted"` without evidence, or evidence without extraction */
  | "source-evidence-mismatch";

export interface BarcodeIssue {
  code: BarcodeIssueCode;
  /** `error` blocks shipping; `warn` is for a human to look at. */
  severity: "error" | "warn";
  /** the slot at fault, when the issue is about one band */
  slot?: BarcodeSlot;
  /** the part at fault, when the issue is about one part */
  part?: BarcodePart;
  message: string;
}

/** Sum tolerance. Tight enough that a genuinely un-normalised barcode (a
 *  hand-edit that forgot to re-balance) is caught, loose enough that dividing
 *  eleven doubles by their sum is not. */
export const BARCODE_FRAC_EPSILON = 1e-3;

/**
 * Everything wrong with a barcode, as a list. Never throws, never returns just
 * a boolean: the admin needs to SHOW the author which slot is at fault, and a
 * `false` cannot be rendered.
 *
 * `error` ⇒ this barcode cannot be painted or must not be trusted.
 * `warn`  ⇒ unusual; a human should agree with it before it ships.
 */
export function validateBarcode(barcode: VoxelBarcode): BarcodeIssue[] {
  const issues: BarcodeIssue[] = [];
  const present = presentBands(barcode.bands);

  for (const b of present) {
    if (!isBarcodeHex(b.hex)) {
      issues.push({
        code: "bad-hex",
        severity: "error",
        slot: b.slot,
        message: `${b.slot}: ${JSON.stringify(b.hex)} 不是 #rrggbb`,
      });
    }
    if (!Number.isFinite(b.frac) || b.frac <= 0) {
      issues.push({
        code: "bad-frac",
        severity: "error",
        slot: b.slot,
        message: `${b.slot}: 佔比 ${b.frac} 必須是正數（不存在的槽請寫 null）`,
      });
    }
  }

  // 缺帶 — a whole box with nothing to paint it. Checked per part, because
  // "8 bands but all of them on the head" is still a legless character.
  for (const part of BARCODE_PARTS) {
    const has = present.some((b) => BARCODE_SLOT_PART[b.slot] === part && b.frac > 0);
    if (!has) {
      issues.push({
        code: "missing-band",
        severity: "error",
        part,
        message: `${part} 沒有任何色帶 —— 這個部位會沒有顏色`,
      });
    }
  }

  if (present.length > 0 && present.length < BARCODE_MIN_BANDS) {
    issues.push({
      code: "too-few-bands",
      severity: "warn",
      message: `只有 ${present.length} 條帶（< ${BARCODE_MIN_BANDS}）—— §4.2 判為 SUSPECT`,
    });
  }

  // 總和
  const total = totalFrac(barcode.bands);
  if (present.length > 0 && Math.abs(total - 1) > BARCODE_FRAC_EPSILON) {
    issues.push({
      code: "not-normalized",
      severity: "error",
      message: `佔比總和 ${total.toFixed(6)}，必須是 1.0（±${BARCODE_FRAC_EPSILON}）`,
    });
  }

  // 泥巴柱 — the whole point of the barcode is that the bands DIFFER.
  const maxDe = maxPairwiseDeltaE(barcode);
  if (maxDe < BARCODE_MUD_COLUMN_DELTA_E) {
    issues.push({
      code: "mud-column",
      severity: "error",
      message: `帶間最大 ΔE ${maxDe.toFixed(2)} < ${BARCODE_MUD_COLUMN_DELTA_E} —— 一根泥巴柱，不是角色`,
    });
  }

  // 佔比超界 — advisory, see BARCODE_TYPICAL_FRAC's header.
  for (const b of present) {
    const [lo, hi] = BARCODE_TYPICAL_FRAC[b.slot];
    if (Number.isFinite(b.frac) && b.frac > 0 && (b.frac < lo || b.frac > hi)) {
      issues.push({
        code: "frac-out-of-range",
        severity: "warn",
        slot: b.slot,
        message: `${b.slot}: 佔比 ${b.frac.toFixed(4)} 在典型區間 [${lo}, ${hi}] 之外`,
      });
    }
  }

  // source ↔ evidence
  if (barcode.source === "extracted" && !barcode.extraction) {
    issues.push({
      code: "source-evidence-mismatch",
      severity: "error",
      message: "source: 'extracted' 但沒有 extraction 證據 —— 無法複查裁決",
    });
  }
  if (barcode.source !== "extracted" && barcode.extraction) {
    issues.push({
      code: "source-evidence-mismatch",
      severity: "warn",
      message: `source: '${barcode.source}' 卻帶著 extraction 證據 —— 兩者對不上`,
    });
  }

  return issues;
}

/** The `error`-severity subset — "may this ship". */
export function barcodeErrors(barcode: VoxelBarcode): BarcodeIssue[] {
  return validateBarcode(barcode).filter((i) => i.severity === "error");
}
