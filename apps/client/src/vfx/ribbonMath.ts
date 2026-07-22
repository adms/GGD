/**
 * ribbonMath — the PURE half of the ribbon@1 renderer (no Babylon imports,
 * unit-testable in Node): the 刀光 budget constants, ring-buffer sizing, the
 * swept-strip path construction (pos ± worldUp·width, TAPERED by sample age)
 * and the age/speed-weighted vertex colors laid out in Babylon's CreateRibbon
 * vertex order (path0 points, then path1).
 *
 * TASK #37 — why a swing trail used to pool into light pollution:
 *
 *  1. ADDITIVE RIBBONS NEVER FADED AT ALL. `blendMode: "additive"` maps to
 *     Constants.ALPHA_ONEONE = `blendFunc(ONE, ONE)`, and StandardMaterial only
 *     premultiplies rgb by alpha for ALPHA_PREMULTIPLIED(_PORTERDUFF) (see
 *     standardMaterial.js `defines.PREMULTIPLYALPHA = alphaMode === 7 || 8`).
 *     Source alpha is therefore DISCARDED for the color channels: the old
 *     `alpha = 1 - age/lifespan` vertex fade was a no-op on 51 of the 55 ribbon
 *     docs, so every sample stayed at full brightness for the whole ring and
 *     the strip read as one solid slab of light. The fix is to fade the vertex
 *     RGB (`fadeMode: "premultiplied"`), which the shader DOES apply
 *     (default.fragment `baseColor.rgb *= vColor.rgb`, then
 *     `finalDiffuse = clamp(... + emissiveColor ...) * baseColor.rgb`).
 *  2. THE TAIL COULD NEVER REACH ZERO. The ring caps at 64 samples (≈1.07 s at
 *     60 Hz) while the fade divided age by `lifespanSec`; docs authored at
 *     1.0–2.0 s left the OLDEST sample at ~50 % alpha — a hard-edged permanent
 *     band. `ribbonSampleCount` is now derived from the CLAMPED lifespan, so
 *     the buffer always spans the full fade (`ribbonCoversLifespan`).
 *  3. CONSTANT WIDTH = A BAND, NOT A BLADE. Every sample used the same
 *     widthAbove/widthBelow, so the sweep was a rectangle. Width now tapers
 *     with age (`sampleWidthScale`) and pinches to nothing at the tail.
 *  4. ALWAYS-ON. Ribbons are AMBIENT attachments: they trailed the weapon bone
 *     every frame of the entity's life — idling, walking, standing still. A
 *     near-stationary anchor collapses the whole ring onto one point, stacking
 *     N coincident additive quads into a glued-on blob. `swingGateStep` /
 *     `swingWeight` gate the trail on the anchor's speed RELATIVE TO THE
 *     ENTITY ROOT (world speed is useless — a champion walks at ~6 u/s), so a
 *     trail exists only while the blade is actually being swung.
 *
 * The contract the tests hold this to: from the moment the blade stops moving,
 * the trail is COMPLETELY gone within RIBBON_FADE_BUDGET_SEC (0.25 s).
 */
import type { ColorStop } from "./particleFactory";

export interface RibbonSample {
  x: number;
  y: number;
  z: number;
  /** timestamp (ms) the anchor passed through this point */
  tMs: number;
  /**
   * Swing weight 0..1 captured WHEN the sample was laid down (how fast the
   * blade was moving). Undefined = 1 (legacy/full). Baked per sample so the
   * streak keeps the brightness history of the swing that made it.
   */
  w?: number;
}

// ---------------------------------------------------------------------------
// 刀光 budget — the shape of a blade afterimage
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on a trail sample's life. 刀光劍影 is a 2–3 frame streak that
 * hugs the arc, not a banner: anything above ~0.2 s starts to pool.
 */
export const RIBBON_MAX_LIFESPAN_SEC = 0.2;
/** Floor, so a degenerate doc can't produce a zero-length (invisible) strip. */
export const RIBBON_MIN_LIFESPAN_SEC = 0.06;
/**
 * The task contract: a swing must be COMPLETELY gone this long after the blade
 * stops. Kept strictly above RIBBON_MAX_LIFESPAN_SEC as headroom.
 */
export const RIBBON_FADE_BUDGET_SEC = 0.25;
/** Ring sample rate (frame-rate independent — see RibbonTrail.tick). */
export const RIBBON_SAMPLE_HZ = 60;
/** Absolute ring cap (overdraw discipline; never binds at ≤0.2 s). */
export const RIBBON_SAMPLE_CAP = 64;
/**
 * Alpha falloff exponent along the strip (>1 = sharp). Linear left the middle
 * of the ribbon at 50 % brightness, which is what made it read as a slab.
 */
export const RIBBON_ALPHA_EXP = 2.4;
/** Width taper exponent along the strip (<1 = keeps body near the head). */
export const RIBBON_WIDTH_EXP = 0.75;
/** Per-side width ceiling (world units) — a blade arc, never a wall. */
export const RIBBON_MAX_HALF_WIDTH = 0.7;

/** Clamp an authored lifespan into the 刀光 budget. */
export function clampRibbonLifespanSec(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return RIBBON_MIN_LIFESPAN_SEC;
  return Math.min(RIBBON_MAX_LIFESPAN_SEC, Math.max(RIBBON_MIN_LIFESPAN_SEC, sec));
}

/** Clamp an authored half-width (above/below) into the blade-arc budget. */
export function clampRibbonHalfWidth(w: number): number {
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.min(RIBBON_MAX_HALF_WIDTH, w);
}

/** Ring-buffer length: lifespan at the sample rate, capped (min 2 points). */
export function ribbonSampleCount(
  lifespanSec: number,
  sampleHz = RIBBON_SAMPLE_HZ,
  cap = RIBBON_SAMPLE_CAP,
): number {
  return Math.max(2, Math.min(cap, Math.ceil(lifespanSec * sampleHz) + 1));
}

/**
 * True when the ring spans the WHOLE fade, i.e. the oldest sample is at least
 * `lifespanSec` old and therefore reaches alpha 0. False = a permanently
 * bright tail edge (the bug that made long-lifespan ribbons a solid band).
 */
export function ribbonCoversLifespan(
  lifespanSec: number,
  sampleHz = RIBBON_SAMPLE_HZ,
  cap = RIBBON_SAMPLE_CAP,
): boolean {
  return (ribbonSampleCount(lifespanSec, sampleHz, cap) - 1) / sampleHz >= lifespanSec;
}

// ---------------------------------------------------------------------------
// Age curves
// ---------------------------------------------------------------------------

/** Linear remaining life 1 → 0 over the lifespan (clamped). 1 = just laid. */
export function sampleLife(ageMs: number, lifespanMs: number): number {
  if (lifespanMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - ageMs / lifespanMs));
}

/**
 * Alpha at a sample age: sharp exponential falloff of the remaining life.
 * Monotonically decreasing in age, exactly 0 once age ≥ lifespan.
 */
export function sampleAlpha(ageMs: number, lifespanMs: number, exp = RIBBON_ALPHA_EXP): number {
  return Math.pow(sampleLife(ageMs, lifespanMs), exp);
}

/**
 * Width scale at a remaining-life fraction: full at the head (the blade),
 * pinched to nothing at the tail. Monotonically increasing in `life`.
 */
export function sampleWidthScale(life: number, exp = RIBBON_WIDTH_EXP): number {
  return Math.pow(Math.min(1, Math.max(0, life)), exp);
}

/** Remaining-life fraction per sample, oldest → newest (parallel array). */
export function sampleLifeFractions(
  samples: readonly RibbonSample[],
  nowMs: number,
  lifespanMs: number,
): number[] {
  const out = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = sampleLife(nowMs - samples[i]!.tMs, lifespanMs);
  return out;
}

export type Vec3Triple = [number, number, number];

/**
 * Swept-strip paths for CreateRibbon: top[i] = sample + up·widthAbove·k,
 * bottom[i] = sample − up·widthBelow·k (world-up strip, WC3 RIBB convention).
 * `samples` is ordered oldest → newest. `life` (optional, parallel to
 * `samples`) tapers the strip by age so the sweep is a crescent that pinches
 * to a point instead of a rectangular band; omit it for the raw untapered
 * geometry.
 */
export function buildRibbonPaths(
  samples: readonly RibbonSample[],
  widthAbove: number,
  widthBelow: number,
  life?: readonly number[],
): { top: Vec3Triple[]; bottom: Vec3Triple[] } {
  const top: Vec3Triple[] = [];
  const bottom: Vec3Triple[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const k = life ? sampleWidthScale(life[i] ?? 0) : 1;
    top.push([s.x, s.y + widthAbove * k, s.z]);
    bottom.push([s.x, s.y - widthBelow * k, s.z]);
  }
  return { top, bottom };
}

// ---------------------------------------------------------------------------
// Vertex colors — the fade that actually reaches the framebuffer
// ---------------------------------------------------------------------------

/**
 * How a blend mode wants "gone" expressed, because the alpha channel does NOT
 * reach the color output for every mode:
 *  · premultiplied — additive (ONE, ONE): alpha is discarded, so RGB must be
 *    scaled down to fade. THE additive-ribbon fix.
 *  · alpha — standard/alphaKey (SRC_ALPHA, 1−SRC_ALPHA): fade the alpha.
 *  · toWhite — modulate (DST_COLOR, ZERO): alpha is discarded and RGB
 *    multiplies the framebuffer, so "gone" is white, not black.
 */
export type RibbonFadeMode = "premultiplied" | "alpha" | "toWhite";

/** Blend mode → the fade channel that survives it. */
export function ribbonFadeModeFor(blend: string): RibbonFadeMode {
  switch (blend) {
    case "additive":
      return "premultiplied";
    case "modulate":
      return "toWhite";
    default:
      return "alpha";
  }
}

/** Linear-interpolated rgba at t over ascending color stops (clamped ends). */
export function sampleColorStops(
  stops: readonly ColorStop[],
  t: number,
): [number, number, number, number] {
  if (stops.length === 0) return [1, 1, 1, 1];
  const k = Math.min(1, Math.max(0, t));
  let lo = stops[0]!;
  if (k <= lo[0]) return [lo[1][0], lo[1][1], lo[1][2], lo[1][3]];
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    if (k <= hi[0]) {
      const span = hi[0] - lo[0];
      const f = span > 0 ? (k - lo[0]) / span : 0;
      return [
        lo[1][0] + (hi[1][0] - lo[1][0]) * f,
        lo[1][1] + (hi[1][1] - lo[1][1]) * f,
        lo[1][2] + (hi[1][2] - lo[1][2]) * f,
        lo[1][3] + (hi[1][3] - lo[1][3]) * f,
      ];
    }
    lo = hi;
  }
  return [lo[1][0], lo[1][1], lo[1][2], lo[1][3]];
}

export interface RibbonColorOptions {
  /**
   * Hot→cool RGB ramp sampled by sample AGE (t = 1 − life): white-hot leading
   * edge → the doc's tint → cooled tail. Build it with the task #33 toolkit
   * (`hotToCoolStops`) so trails match the rest of the combat kit. Only the
   * RGB of the ramp is used — alpha is owned by the age falloff below.
   */
  stops?: readonly ColorStop[];
  /** which channel actually fades under this blend mode (default alpha) */
  fadeMode?: RibbonFadeMode;
  /** alpha falloff exponent (default RIBBON_ALPHA_EXP) */
  exp?: number;
  /** reusable destination buffer (avoids a per-frame allocation) */
  out?: number[] | Float32Array;
}

/**
 * Flat RGBA vertex-color array for the ribbon mesh: one color per path point,
 * top path first then bottom path (Babylon ribbon vertex order for a 2-path
 * pathArray). Per sample: RGB from the hot→cool age ramp (or the flat doc
 * color), faded by `docAlpha × life^exp × swingWeight` through whichever
 * channel the blend mode actually honours.
 */
export function ribbonVertexColors(
  samples: readonly RibbonSample[],
  nowMs: number,
  lifespanMs: number,
  rgba: readonly [number, number, number, number],
  opts: RibbonColorOptions = {},
): number[] | Float32Array {
  const n = samples.length;
  const fadeMode = opts.fadeMode ?? "alpha";
  const exp = opts.exp ?? RIBBON_ALPHA_EXP;
  const out = opts.out ?? new Array<number>(n * 2 * 4);
  for (let i = 0; i < n; i++) {
    const s = samples[i]!;
    const life = sampleLife(nowMs - s.tMs, lifespanMs);
    const fade = Math.pow(life, exp) * (s.w ?? 1);
    const a = rgba[3] * fade;
    let r = rgba[0];
    let g = rgba[1];
    let b = rgba[2];
    if (opts.stops && opts.stops.length > 0) {
      const c = sampleColorStops(opts.stops, 1 - life);
      r = c[0];
      g = c[1];
      b = c[2];
    }
    if (fadeMode === "premultiplied") {
      r *= fade;
      g *= fade;
      b *= fade;
    } else if (fadeMode === "toWhite") {
      r += (1 - r) * (1 - fade);
      g += (1 - g) * (1 - fade);
      b += (1 - b) * (1 - fade);
    }
    // both ribbon paths share the sample's age → same color
    for (let path = 0; path < 2; path++) {
      const o = (path * n + i) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Swing gate — a trail only exists while the blade is being swung
// ---------------------------------------------------------------------------

/**
 * Anchor speed (world u/s, RELATIVE to the entity root) at which a trail
 * starts. A champion walks at ~6 u/s of WORLD speed, so world speed cannot
 * separate a swing from a stroll — relative speed can: idle breathing sits
 * well under 1, an arm swinging while running reaches ~1–2, an attack arc
 * whips the weapon bone through 5–15.
 */
export const SWING_ON_SPEED = 3;
/** Below this the blade is considered still (and contributes NO brightness). */
export const SWING_OFF_SPEED = 1.25;
/** Speed at which a swing is at full brightness. */
export const SWING_FULL_SPEED = 8;
/**
 * Hysteresis: how long the anchor must stay slow before the gate closes, so a
 * swing that momentarily slows mid-arc doesn't chop the streak in two. Samples
 * laid during this window carry weight 0 (invisible), so it never extends how
 * long anything is actually VISIBLE.
 */
export const SWING_RELEASE_MS = 80;

export interface SwingGateState {
  /** true while the trail lays samples */
  open: boolean;
  /** ms spent continuously below SWING_OFF_SPEED */
  quietMs: number;
}

export const SWING_GATE_CLOSED: SwingGateState = { open: false, quietMs: Infinity };

/**
 * Pure gate step: opens above SWING_ON_SPEED, closes after SWING_RELEASE_MS
 * continuously below SWING_OFF_SPEED. The band between the two thresholds
 * holds whatever state it was in (no flicker at the edge).
 */
export function swingGateStep(
  state: SwingGateState,
  speed: number,
  dtMs: number,
  onSpeed = SWING_ON_SPEED,
  offSpeed = SWING_OFF_SPEED,
  releaseMs = SWING_RELEASE_MS,
): SwingGateState {
  const quietMs = speed < offSpeed ? state.quietMs + Math.max(0, dtMs) : 0;
  if (speed >= onSpeed) return { open: true, quietMs: 0 };
  if (state.open && quietMs >= releaseMs) return { open: false, quietMs };
  return { open: state.open, quietMs };
}

/**
 * Brightness weight 0..1 for a sample laid at `speed`: nothing at or below
 * SWING_OFF_SPEED (so a parked blade can never light anything up), full at
 * SWING_FULL_SPEED. This is what keeps the release window invisible.
 */
export function swingWeight(
  speed: number,
  offSpeed = SWING_OFF_SPEED,
  fullSpeed = SWING_FULL_SPEED,
): number {
  if (!(speed > offSpeed)) return 0;
  const span = fullSpeed - offSpeed;
  if (span <= 0) return 1;
  return Math.min(1, (speed - offSpeed) / span);
}
