/**
 * castBeam — PURE planning math for the task #233 向天光束 cast telegraph:
 * 「施法向天光束預告（程序生成）— 讓人來得及閃」.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * It is NOT a second telegraph. #228 already ships two of them — the ground
 * shape (`TelegraphLayer`) and the light column (`CastPillarFx`), both driven
 * by the sim's own `castBegin` window for EVERY ability in the game. Building
 * a third would put three announcements on one beat and teach the player to
 * ignore all of them.
 *
 * This module fixes the two things that stop the column from being the beam
 * the owner asked for, and both of them are measurements, not opinions:
 *
 * 1. THE BEAM IS MOSTLY OFF-SCREEN. Under the shipped combat camera
 *    (CAMERA_PITCH_RAD 68°, closest zoom DOLLY_MIN = 10, fov 0.8) the
 *    VERTICAL BUDGET above a champion is only ~5.2 u at the centre of the
 *    frame, ~8.5 u at the bottom edge and ~0.8 u at the top edge — and the
 *    visible ground patch is barely 8 u deep. Measured over the framed ground
 *    positions, the shipped `PILLAR_HEIGHT = 6.4` fits INSIDE THE FRAME at 6%
 *    of them. A beam whose top is off-screen 94% of the time does not read as
 *    a beam to the sky; it reads as a bright smudge at the feet. So the height
 *    is PLANNED per caster per frame from the real headroom instead of being a
 *    constant (`castBeamPlan`).
 *
 * 2. IT PROMISES A DODGE IT USUALLY CANNOT DELIVER. Derived from the REAL cast
 *    times in `content/abilities/*.json` (669 docs) against the REAL client
 *    pipeline (`INTERP_DELAY_MS`, the 30 Hz tick, and the column's own fade-in),
 *    only the 0.6–0.9 s tier leaves a human a genuine reaction window. See
 *    `beamVerdict` — the beam RENDERS DIFFERENTLY for a cast nobody can dodge,
 *    because a countdown to an unavoidable hit is a lie.
 *
 * Everything here is Babylon-free so `castBeam.test.ts` and the framing gate in
 * `castBeamFraming.test.ts` can run it against the real camera model in the
 * node env.
 */
import { INTERP_DELAY_MS, TICK_HZ } from "@ggd/shared/constants";
import { PILLAR_HEIGHT, RISE_FRACTION } from "./castPillar";

// ---------------------------------------------------------------------------
// framing — how tall the beam may be
// ---------------------------------------------------------------------------

/**
 * The champion yardstick. #150 normalised every champion to ~1.7 u of
 * on-screen height, so this is "one champion tall" — the shortest thing that
 * still reads as a column rather than as a glow on the floor, and the natural
 * floor for the beam because a caster whose own body is framed should get a
 * beam that is framed too.
 */
export const BEAM_BODY_H = 1.7;

/** Never shorter than the champion casting it. */
export const BEAM_MIN_H = BEAM_BODY_H;

/**
 * Never taller than this however far the camera zooms out. At DOLLY_MAX the
 * headroom is over 20 u; a 20 u pillar is a searchlight, not a telegraph, and
 * it would swamp the arena it is supposed to annotate.
 *
 * It IS the #228 authored height — that number was never wrong as an artistic
 * ceiling, only as an unconditional one. Deriving the cap from it keeps one
 * definition of "how tall this effect is allowed to be".
 */
export const BEAM_MAX_H = PILLAR_HEIGHT;

/**
 * Fraction of the measured headroom the beam actually spends. The remaining
 * 5% is the gap between "mathematically inside the frustum" and "not touching
 * the edge of the screen" — the same reason `effectFraming` keeps a margin.
 */
export const BEAM_HEADROOM_USE = 0.95;

/**
 * A bright TIP FLARE occupies the top of the beam, so the column terminates in
 * something instead of fading into nothing. This is what makes it read as
 * reaching UP: the eye needs to see where the beam ends. Expressed as a
 * fraction of the beam's own height (so it scales with the plan).
 */
export const BEAM_TIP_FRACTION = 0.18;

export interface BeamPlan {
  /** measured vertical budget above the caster, world units */
  headroom: number;
  /** how tall the beam should be drawn this frame */
  height: number;
  /** fraction of `height` that is inside the frame (1 = wholly framed) */
  onFrameFraction: number;
  /** is the caster's own BODY framed? (the fairness yardstick) */
  bodyFramed: boolean;
  /**
   * True when the caster is so close to the frame edge that even a
   * one-champion beam cannot be wholly shown. The renderer drops to the ground
   * flare alone there — a half-drawn column at the screen edge is noise.
   */
  degraded: boolean;
}

/**
 * Headroom to assume when the caller cannot measure one (a NullEngine test, or
 * a frame before any camera exists). It is the REAL budget directly above the
 * followed champion under the shipped combat camera at its default dolly —
 * `castBeamFraming.test.ts` recomputes it with `render/effectFraming` and fails
 * if this number and the camera ever drift apart, which is exactly how #93's
 * "verified" framing rotted when #161 changed the pitch.
 */
export const BEAM_DEFAULT_HEADROOM = 5.17;

export interface BeamPlanOptions {
  /**
   * Vertical budget above the caster. Callers pass `verticalHeadroom(...)`
   * from `render/effectFraming` — the ONE place the camera is modelled.
   */
  headroom: number;
}

/** Plan the beam for one caster from the measured headroom. */
export function castBeamPlan(opts: BeamPlanOptions): BeamPlan {
  const headroom = Number.isFinite(opts.headroom) && opts.headroom > 0 ? opts.headroom : 0;
  const wanted = headroom * BEAM_HEADROOM_USE;
  const height = Math.min(BEAM_MAX_H, Math.max(BEAM_MIN_H, wanted));
  const onFrameFraction = height > 0 ? Math.min(1, headroom / height) : 0;
  const bodyFramed = headroom >= BEAM_BODY_H;
  return { headroom, height, onFrameFraction, bodyFramed, degraded: !bodyFramed };
}

// ---------------------------------------------------------------------------
// timing — can this cast actually be dodged?
// ---------------------------------------------------------------------------

/**
 * Fraction of the cast window the column spends becoming visible. Taken from
 * `pillarShape`'s own `fadeIn = clamp01(t / 0.14)` — the first moment the
 * telegraph carries any information at all. Deriving it from the renderer
 * rather than guessing is the difference between a budget and a wish.
 */
export const TELEGRAPH_LEGIBLE_FRACTION = 0.14;

/**
 * Simple visual reaction time for an alerted adult, in ms. This is the
 * OPTIMISTIC end of the published range (~250 ms simple, 350–450 ms choice
 * reaction under load), used deliberately: if a cast is not dodgeable even
 * under the optimistic figure, it is certainly not dodgeable in a brawl.
 */
export const HUMAN_REACTION_MS = 250;

/** One sim tick — the granularity a movement order can be applied at. */
export const TICK_MS = 1000 / TICK_HZ;

/**
 * A dodge that only just succeeds does not feel like a dodge. A cast clears
 * this much slack above zero before it is called comfortably reactable.
 */
export const COMFORTABLE_SLACK_MS = 150;

export type BeamVerdict = "instant" | "notice" | "marginal" | "reactable";

export interface BeamTiming {
  castMs: number;
  /** ms after castBegin at which the telegraph is legible */
  legibleAtMs: number;
  /** ms of genuine decision time the player is left with (may be negative) */
  reactionBudgetMs: number;
  verdict: BeamVerdict;
}

/**
 * How much room to move this cast really leaves.
 *
 *   budget = castMs
 *          − the telegraph's own fade-in
 *          − INTERP_DELAY_MS   (the client renders that far behind the sim)
 *          − HUMAN_REACTION_MS
 *          − one sim tick      (the order cannot be applied sooner)
 *
 * `instant` is an ability with no cast window at all: there is nothing to
 * telegraph and the beam never appears for it.
 */
export function beamTiming(castMs: number | null | undefined): BeamTiming {
  const ms = Number.isFinite(castMs) && (castMs as number) > 0 ? (castMs as number) : 0;
  if (ms <= 0) {
    return { castMs: 0, legibleAtMs: 0, reactionBudgetMs: -Infinity, verdict: "instant" };
  }
  const legibleAtMs = ms * TELEGRAPH_LEGIBLE_FRACTION;
  const budget = ms - legibleAtMs - INTERP_DELAY_MS - HUMAN_REACTION_MS - TICK_MS;
  const verdict: BeamVerdict =
    budget >= COMFORTABLE_SLACK_MS ? "reactable" : budget > 0 ? "marginal" : "notice";
  return { castMs: ms, legibleAtMs, reactionBudgetMs: budget, verdict };
}

/** Shorthand for the verdict alone. */
export function beamVerdict(castMs: number | null | undefined): BeamVerdict {
  return beamTiming(castMs).verdict;
}

// ---------------------------------------------------------------------------
// the descending impact knot
// ---------------------------------------------------------------------------

/**
 * THE ONLY NEW SIGNAL THIS TASK ADDS: a bright knot that falls down the beam
 * and touches the floor on the frame the ability resolves. It answers "HOW
 * LONG have I got", which neither the ground shape nor the column's brightness
 * ramp ever said — they both only say "something is happening".
 *
 * Returned as a height in BEAM units (0 = the caster's feet, 1 = the tip), so
 * the renderer multiplies it by the planned height. It is deliberately linear:
 * an eased countdown reads as slowing down and would systematically mislead a
 * player about the last, most important 100 ms.
 *
 * `null` means DRAW NO KNOT — for a cast nobody can react to, and before the
 * beam itself is legible. A countdown to an unavoidable hit is a lie, and the
 * telegraph's whole value is that the player can trust it.
 */
export function beamKnotHeight(
  progress01: number,
  verdict: BeamVerdict,
): number | null {
  if (verdict === "instant" || verdict === "notice") return null;
  const t = progress01 < 0 ? 0 : progress01 > 1 ? 1 : progress01;
  // hold the knot at the tip until the beam has finished erupting, otherwise it
  // starts falling through a column that is still growing under it
  if (t < RISE_FRACTION) return 1;
  const u = (t - RISE_FRACTION) / (1 - RISE_FRACTION);
  return 1 - u;
}

/**
 * Vertical brightness of the beam at height fraction `t` (0 = foot, 1 = tip),
 * as a multiplier on the palette.
 *
 * The #228 column ramps DOWN with height and nothing else, which is why its
 * top dissolves into the sky and the eye never finds an end to it. Adding a
 * tip flare gives the beam a terminus — the cheapest way to make a column read
 * as "reaching up" rather than "leaking upward".
 */
export function beamRiseProfile(t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const base = Math.pow(1 - k, 1.4) * 0.62 + 0.2;
  // gaussian bump centred just under the tip
  const c = 1 - BEAM_TIP_FRACTION * 0.5;
  const w = BEAM_TIP_FRACTION * 0.62;
  const tip = 0.55 * Math.exp(-((k - c) * (k - c)) / (2 * w * w));
  return base + tip;
}
