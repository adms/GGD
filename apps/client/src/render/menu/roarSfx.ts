/**
 * Pure roar → SFX-key routing (task #26). The login scene emits two KINDS of
 * dragon roar and they must sound DIFFERENT:
 *
 * - `big` (scripted): the loud, centred ACTION roar fired once as the
 *   enter-transition swoop or the return-intro pull-back begins — routed to
 *   `dragonRoarBig`, the pitched-down ANGRY clip (audio-map gain 1.0).
 * - ambient (not big): the periodic near/far, stereo-panned LONG-HOWL of the
 *   two vista dragons — stays on the original 2-clip `dragonRoar` pool.
 *
 * Pure + DOM-free so AuthScreen's routing decision is unit-testable.
 */
import type { RoarEvent } from "./LoginScene";

export type RoarSfxKey = "dragonRoar" | "dragonRoarBig";

/** Which audio-map SFX key a {@link RoarEvent} plays: big → the angry clip. */
export function roarSfxKey(ev: Pick<RoarEvent, "big">): RoarSfxKey {
  return ev.big ? "dragonRoarBig" : "dragonRoar";
}

/**
 * Volume for the reduced-motion / WebGL-off return fallback: no pull-back swoop
 * plays, but the arrival still gets a SOFT angry roar (the mixer's SFX-bus
 * mute/volume still gates it). Softer than the scripted BIG_ROAR_VOLUME (1.5)
 * because there is no visual to justify a blast.
 */
export const SOFT_RETURN_ROAR_VOLUME = 0.8;
