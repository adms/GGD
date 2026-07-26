/**
 * LEAP FRAMING (task #247b) — "is the leap actually ON SCREEN?", measured, not
 * assumed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * #247 shipped a real parabolic leap rebuilt from the map's JASS. The sim was
 * right, the wire was right, the renderer was right — and 蒼月潮's 07-03 was
 * OFF SCREEN for 73% of its 44 ticks, part of it FULLY BEHIND THE NEAR PLANE
 * (the model turns inside-out / disappears outright). Nothing caught it because
 * nothing had ever measured a leap against the camera the game actually ships.
 *
 * That is #93 repeating: a giant roast-chicken firework built over seven
 * iterations that the player never saw. The rule this project recorded from #93
 * is 「驗證畫面必須用遊戲真正的 68° 鏡頭拍」 — verification must be shot through
 * the game's real camera, not a convenient one. So this module measures nothing
 * itself: it hands world points to a `project` callback that the test wires to
 * a REAL `CameraRig` at `DOLLY_DEFAULT` and `CAMERA_PITCH_RAD`, and counts.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS SAMPLED
 * ---------------------------------------------------------------------------
 * Not the sim's per-tick height — the height the PLAYER sees. The client
 * interpolates `h` with the same Catmull-Rom spline it uses for x/z
 * (net/InterpolationBuffer), and a Catmull-Rom can overshoot at an extremum, so
 * `sampleLeapArc` runs the real `leapHeightAt`/`leapPosAt` through the real
 * `catmullRom1D` at sub-tick resolution. If the rendered apex ever exceeds the
 * authored apex, that overshoot is inside the measurement.
 *
 * Two points per sample, because "visible" is not one thing:
 *   FEET  y = h                     — gone ⇒ the whole champion is gone
 *   HEAD  y = h + TARGET_HEIGHT      — gone ⇒ the champion is being cropped
 *
 * ---------------------------------------------------------------------------
 * THE THREE VERDICTS
 * ---------------------------------------------------------------------------
 *   nearPlane  the body is inside the camera's near plane. Catastrophic and
 *              non-negotiable: geometry clips inside-out or vanishes, and it is
 *              strictly worse than being above the frame. Budget: ZERO.
 *   outside    NEITHER point is inside the viewport — no pixel of the champion
 *              is drawn. This is the "where did he go" failure.
 *   cropped    the head is out but the feet are in. Half a champion at the top
 *              edge still reads (the shadow and team ring are on the ground
 *              under him), so this is rationed, not banned — a brief clipped
 *              apex on the single biggest leap in the game is deliberate drama.
 */
import { leapHeightAt, leapPosAt } from "@ggd/shared/sim";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { catmullRom1D } from "./math/motion";
import { TARGET_HEIGHT } from "./views/ChampionView";

/** One arc to measure: what the sim would produce for a `leap` EffectDef. */
export interface LeapArcSpec {
  /** apex in GGD units (content `apexHeight`, post-conversion) */
  apexHeight: number;
  /** integer tick budget (content `durationSec` through `leapTicks`) */
  ticks: number;
  /** takeoff point */
  from: Vec2;
  /** landing point (equal to `from` for an inPlace vertical hop) */
  to: Vec2;
}

/** A rendered instant of the arc: where the body is, in world space. */
export interface LeapArcSample {
  /** fractional tick (0 = takeoff, `ticks` = touchdown) */
  t: number;
  /** interpolated fly height, GGD units — what ChampionView writes */
  h: number;
  x: number;
  z: number;
}

/**
 * The rendered arc, sampled `sub` times per sim tick through the SAME
 * Catmull-Rom the client feeds its poses through. `sub = 1` degenerates to the
 * raw sim ticks; the default of 4 is well above the 2 render frames per tick a
 * 60 fps client gets from a 30 Hz sim, so any spline overshoot between ticks is
 * seen.
 */
export function sampleLeapArc(spec: LeapArcSpec, sub = 4): LeapArcSample[] {
  const { ticks: N, apexHeight, from, to } = spec;
  const apexMilli = Math.round(apexHeight * 1000);
  const hAt = (k: number): number => leapHeightAt(clampTick(k, N), N, apexMilli);
  const pAt = (k: number): Vec2 => leapPosAt(from, to, clampTick(k, N), N);
  const out: LeapArcSample[] = [];
  for (let k = 0; k < N; k++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      // Same tangent construction as InterpolationBuffer: p0/p3 are the outer
      // samples, one-sided at the ends (hasP0/hasP3 false there).
      const hasP0 = k - 1 >= 0;
      const hasP3 = k + 2 <= N;
      const h = catmullRom1D(hAt(k - 1), hAt(k), hAt(k + 1), hAt(k + 2), t, hasP0, hasP3);
      const p0 = pAt(k - 1);
      const p1 = pAt(k);
      const p2 = pAt(k + 1);
      const p3 = pAt(k + 2);
      out.push({
        t: k + t,
        h,
        x: catmullRom1D(p0.x, p1.x, p2.x, p3.x, t, hasP0, hasP3),
        z: catmullRom1D(p0.z, p1.z, p2.z, p3.z, t, hasP0, hasP3),
      });
    }
  }
  // touchdown itself: height is exactly 0 by branch, position is `to` verbatim
  out.push({ t: N, h: 0, x: to.x, z: to.z });
  return out;
}

function clampTick(k: number, N: number): number {
  return k < 0 ? 0 : k > N ? N : k;
}

/** What the caller's real camera reports for one world point. */
export interface ProjectedPoint {
  /** inside the viewport rect AND between the near and far planes */
  inFrame: boolean;
  /** the point is nearer than the camera's near plane (inside-out clipping) */
  nearPlane: boolean;
}

export type ProjectFn = (x: number, y: number, z: number) => ProjectedPoint;

export interface LeapFramingReport {
  samples: number;
  /** samples with NO part of the body inside the viewport */
  outside: number;
  /** samples with the head out but the feet in */
  cropped: number;
  /** samples with any body point inside the near plane */
  nearPlane: number;
  /** peak RENDERED height (includes any interpolation overshoot) */
  peakHeight: number;
  outsideFraction: number;
  croppedFraction: number;
}

/**
 * Count the three verdicts over a sampled arc. `project` is called twice per
 * sample (feet, head) and is expected to be a live camera, so the caller may
 * advance/settle its rig between samples — this function never assumes the
 * camera is static.
 */
export function measureLeapFraming(
  samples: readonly LeapArcSample[],
  project: (s: LeapArcSample) => { feet: ProjectedPoint; head: ProjectedPoint },
): LeapFramingReport {
  let outside = 0;
  let cropped = 0;
  let nearPlane = 0;
  let peakHeight = 0;
  for (const s of samples) {
    peakHeight = Math.max(peakHeight, s.h);
    const { feet, head } = project(s);
    if (feet.nearPlane || head.nearPlane) nearPlane++;
    if (!feet.inFrame && !head.inFrame) outside++;
    else if (!head.inFrame) cropped++;
  }
  const n = samples.length || 1;
  return {
    samples: samples.length,
    outside,
    cropped,
    nearPlane,
    peakHeight,
    outsideFraction: outside / n,
    croppedFraction: cropped / n,
  };
}

/** The body height a leap is framed against (#150-normalised champion). */
export const LEAP_BODY_HEIGHT = TARGET_HEIGHT;

/**
 * THE CONTRACT. Chosen against measurement, not taste — see leapFraming.test.ts
 * for the numbers each bound was set from.
 *
 * `maxNearPlaneSamples = 0`. Not a budget, a wall. Inside the near plane the
 * champion is not "hard to see", it is corrupt: back-faces render, the silhouette
 * turns inside-out, or it disappears entirely with no cue at all. There is no
 * amount of this that is acceptable, and it is the specific failure the verifier
 * found on 蒼月潮 (apex 11.00 u vs a 10.25 u near-plane wall at the shipped dolly).
 *
 * `maxOutsideFraction = 0.15`. At 30 Hz that is ~6 ticks (0.2 s) of a 43-tick
 * flight — about the length of a hitstop, and short enough that the eye tracks
 * through it rather than losing the champion. The bound is far harsher than it
 * looks: because h = 4·A·u(1−u), the fraction of a flight spent above a ceiling
 * H is sqrt(1 − H/A), so 15% of the flight corresponds to an apex only 2.3%
 * above the ceiling. Anything that visibly overshoots the frame fails this.
 *
 * `maxCroppedFraction = 0.35`. A cropped head is a real cost but not a lost
 * champion — the feet, the shrinking shadow and the ground-locked team ring all
 * still read, which is exactly why ChampionView keeps the ring and shadow on the
 * floor. 35% buys the single biggest arc in the JASS family (A0RZ, A = 1000) its
 * dramatic apex peek at ~27% measured, with margin, while a whole flight spent
 * decapitated (which is what apex ≥ 4.9 u would be) still fails.
 */
export const LEAP_FRAMING_LIMITS = {
  maxNearPlaneSamples: 0,
  maxOutsideFraction: 0.15,
  maxCroppedFraction: 0.35,
} as const;
