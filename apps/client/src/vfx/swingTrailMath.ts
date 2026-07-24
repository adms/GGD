/**
 * swingTrailMath — the PARTICLE half of task #37's 刀光劍影 retune.
 *
 * `RibbonTrail`/`ribbonMath` fixed the ribbon@1 swing bands. The other half of
 * the light pollution the user reported ("軌跡粒子系統…停留成一大片光污染")
 * comes from the AMBIENT vfx@1 emitters bolted to weapon/hand bones: every one
 * of the ambient continuous docs in content/vfx is a weapon trail, and they
 * were imported straight from WC3 with three defects that stack:
 *
 *  1. LIFETIMES 3–5× THE BLADE BUDGET. `godie-herorider-p0` lives 1.0 s,
 *     `godie-heroshana-p*` 0.6 s, `godie-ye-wuqi1-p*` 0.5 s. A 1 s particle
 *     laid along a fast arc is still hanging in the air four swings later —
 *     that is the "停留太久" the report is about. Clamped to
 *     SWING_TRAIL_MAX_LIFE_SEC, which sits strictly INSIDE the ribbon's
 *     RIBBON_FADE_BUDGET_SEC so both halves of a swing die together.
 *  2. ALPHA THAT NEVER REACHES ZERO. `godie-herorider-p0` holds alpha 1.0 at
 *     ALL THREE authored stops — the particle is at full additive brightness
 *     the instant it is culled. Nothing fades; the cloud just gets denser
 *     until the emitter is destroyed. Replaced with the task #33
 *     `hotToCoolStops` ramp (white-hot → THE DOC'S OWN TINT → cooled → gone),
 *     so COLOUR IDENTITY survives at the tint stop and "gone" means gone.
 *  3. RATE × LIFETIME = A SLAB. rate 100/s × 1.0 s and rate 200/s × 0.5 s both
 *     hold ~100 live additive quads on one bone. `swingTrailRate` caps the
 *     STEADY-STATE live count (SWING_TRAIL_MAX_LIVE) rather than the rate, so
 *     a short-lived doc keeps its density and a long-lived one loses its slab.
 *
 * And the fourth defect, which no per-doc retune can fix: these emitters are
 * ALWAYS ON. A parked champion pumps 100 particles/s into a stationary hand,
 * which is a permanent glued-on glow blob rather than a trail. `swingEmitScale`
 * reuses the ribbon's own `swingWeight` gate (anchor speed measured RELATIVE to
 * the entity root, so walking is not swinging) to fold the emit rate down to a
 * faint SWING_TRAIL_IDLE_RATE ember while idle and open it fully only during an
 * actual arc.
 *
 * Pure logic — no Babylon objects are constructed here; `AmbientVfx` applies
 * `shapeSwingTrailDoc` once when it builds a pooled emitter and calls
 * `swingEmitScale` per frame.
 */
import type { VfxDoc } from "@ggd/shared/content";
import { colorStopsFor, sizeStopsFor, type ColorStop } from "./particleFactory";
import { hotToCoolStops, popShrinkStops, type Rgb } from "./vfxPresets";
import { sampleColorStops, swingWeight } from "./ribbonMath";

// ---------------------------------------------------------------------------
// 刀光 budget for particle trails (mirrors the ribbon budget in ribbonMath)
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on a swing-trail particle's life. Kept strictly BELOW
 * RIBBON_FADE_BUDGET_SEC so a swing's particles and its ribbon band vanish
 * together and the whole streak is gone inside the task's 0.25 s contract.
 */
export const SWING_TRAIL_MAX_LIFE_SEC = 0.22;
/** Floor, so a degenerate doc can't emit particles that die the same frame. */
export const SWING_TRAIL_MIN_LIFE_SEC = 0.08;
/**
 * min = max × this. A spread reads as a streak with a soft trailing edge
 * instead of a hard wall of particles all expiring on the same frame.
 */
export const SWING_TRAIL_LIFE_SPREAD = 0.5;
/**
 * Steady-state live particles allowed per weapon-trail emitter. This is the
 * overdraw knob that actually matters for additive blending: rate alone says
 * nothing, rate × lifetime is what sits on screen.
 */
export const SWING_TRAIL_MAX_LIVE = 24;
/** t where the hot→cool ramp reaches the doc's own tint (identity stop). */
export const SWING_TRAIL_HOT_T = 0.18;
/**
 * Emit rate while the weapon is NOT being swung, as a fraction of the doc's
 * authored rate. Non-zero on purpose: a glowing sword must keep glowing when
 * the champion stands still — it just must not paint a trail.
 */
export const SWING_TRAIL_IDLE_RATE = 0.15;

/**
 * Docs under this id prefix are FAITHFUL WC3 `PRE2` ports (`content/vfx/
 * _w3x-families.json`, the 球體 / 蝗蟲群 / 粒子 families). They are ambient and
 * bone-anchored, so they look exactly like weapon trails to the test below —
 * but they are not trails, and the 刀光 retune would overwrite the very
 * numbers they exist to preserve: it clamps lifetime to 0.25 s, caps the live
 * count and REPLACES the colour ramp with a hot→cool one. `W3xEmitterRig`
 * plays them instead, budgeting them explicitly. Excluded here so that neither
 * `AmbientVfx` nor a future caller silently un-ports them.
 */
export const W3X_FAITHFUL_DOC_PREFIX = "fx.w3x.";

/**
 * True when a vfx doc is a weapon-swing trail: an AMBIENT (lives with the
 * entity) CONTINUOUS emitter pinned to a named bone — minus the faithful WC3
 * ports above. One-shot ability bursts are task #33's and are left untouched.
 */
export function isSwingTrailDoc(doc: VfxDoc): boolean {
  if (doc.id.startsWith(W3X_FAITHFUL_DOC_PREFIX)) return false;
  return doc.ambient === true && doc.mode === "continuous" && doc.anchorBone !== undefined;
}

/** Clamp an authored particle lifetime into the 刀光 budget (min ≤ max). */
export function clampSwingTrailLife(life: { min: number; max: number }): {
  min: number;
  max: number;
} {
  const authored = Number.isFinite(life.max) && life.max > 0 ? life.max : SWING_TRAIL_MAX_LIFE_SEC;
  const max = Math.min(SWING_TRAIL_MAX_LIFE_SEC, Math.max(SWING_TRAIL_MIN_LIFE_SEC, authored));
  return { min: max * SWING_TRAIL_LIFE_SPREAD, max };
}

/**
 * Emit rate that keeps the STEADY-STATE live count (rate × lifetime) under
 * `maxLive`. A doc already below the cap keeps its authored rate — density is
 * part of an effect's identity, only the slab is taken away.
 */
export function swingTrailRate(
  rate: number,
  lifeMaxSec: number,
  maxLive = SWING_TRAIL_MAX_LIVE,
): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  if (!Number.isFinite(lifeMaxSec) || lifeMaxSec <= 0) return rate;
  // FLOOR the cap: the factory rounds the rate UP after the quality scale, so
  // a fractional cap would sneak back over the live-count budget.
  return Math.max(1, Math.min(rate, Math.floor(maxLive / lifeMaxSec)));
}

/** Saturation of an rgb triple (0 = grey/white). */
function saturation(rgb: readonly [number, number, number, number]): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return 0;
  return (max - Math.min(rgb[0], rgb[1], rgb[2])) / max;
}

/**
 * The effect's COLOUR IDENTITY: the most saturated authored stop (brightest
 * wins ties, so an all-white doc stays white). Taking the most saturated stop
 * rather than `color.start` matters — the imported flame trails start at pure
 * white and only reach their hue at the middle stop, so `color.start` would
 * throw the identity away and repaint every effect the same.
 */
export function dominantTint(stops: readonly ColorStop[]): Rgb {
  let best: readonly [number, number, number, number] = [1, 1, 1, 1];
  let bestSat = -1;
  let bestLum = -1;
  for (const [, rgba] of stops) {
    const sat = saturation(rgba);
    const lum = rgba[0] + rgba[1] + rgba[2];
    if (sat > bestSat || (sat === bestSat && lum > bestLum)) {
      best = rgba;
      bestSat = sat;
      bestLum = lum;
    }
  }
  return [best[0], best[1], best[2]];
}

/** Peak authored particle size (the effect's scale identity). */
export function peakSize(stops: readonly (readonly [number, number])[]): number {
  let peak = 0;
  for (const [, s] of stops) if (s > peak) peak = s;
  return peak;
}

type MutableColorStop = [number, [number, number, number, number]];
type MutableSizeStop = [number, number];

/**
 * Retune a weapon-trail doc into the 刀光 budget with task #33's toolkit:
 * clamped lifetime, live-count-capped rate, `hotToCoolStops` colour ramp
 * (white-hot leading edge → the doc's own tint → cooled → alpha 0) and
 * `popShrinkStops` size ramp (pops to the authored peak, shrinks to nothing).
 * Non-trail docs pass through untouched. Idempotent: shaping a shaped doc is a
 * no-op, so a pooled emitter can be rebuilt safely.
 */
export function shapeSwingTrailDoc(doc: VfxDoc): VfxDoc {
  if (!isSwingTrailDoc(doc)) return doc;

  const lifetimeSec = clampSwingTrailLife(doc.lifetimeSec);
  const rate = swingTrailRate(doc.rate ?? 30, lifetimeSec.max);

  const authored = colorStopsFor(doc);
  const tint = dominantTint(authored);
  // peak alpha stays the doc's own opening alpha — a subtle trail stays subtle
  const peakAlpha = sampleColorStops(authored, 0)[3];
  const colorStops = hotToCoolStops(tint, { peakAlpha, hotT: SWING_TRAIL_HOT_T }).map(
    ([t, c]) => [t, [c[0], c[1], c[2], c[3]]] as MutableColorStop,
  );

  const peak = peakSize(sizeStopsFor(doc));
  const sizeStops = (
    peak > 0 ? popShrinkStops(peak) : sizeStopsFor(doc).map(([t, s]) => [t, s] as const)
  ).map(([t, s]) => [t, s] as MutableSizeStop);

  const first = colorStops[0]!;
  const last = colorStops[colorStops.length - 1]!;
  return {
    ...doc,
    lifetimeSec,
    rate,
    colorStops,
    sizeStops,
    // keep the legacy 2-stop fields consistent with the ramps that override
    // them, so anything reading `color`/`size` directly sees the same effect
    color: { start: first[1], end: last[1] },
    size: { start: Math.max(1e-4, sizeStops[0]![1]), end: sizeStops[sizeStops.length - 1]![1] },
  };
}

/**
 * Emit-rate multiplier for a weapon trail at `relSpeed` (anchor speed measured
 * RELATIVE to the entity root — world speed is useless, a champion walks at
 * ~6 u/s). Idle floor → faint ember, full swing → the doc's authored rate.
 * Monotonically increasing in speed and never above 1.
 */
export function swingEmitScale(relSpeed: number, idleRate = SWING_TRAIL_IDLE_RATE): number {
  const floor = Math.min(1, Math.max(0, idleRate));
  return floor + (1 - floor) * swingWeight(relSpeed);
}
