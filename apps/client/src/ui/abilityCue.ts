/**
 * abilityCue — the ONE shared "ability activated" feedback for Q/W/E/R/EX, fired
 * from EVERY input path so the button always answers back:
 *   • desktop on-screen tile press   (ui/components/AbilityBar)
 *   • touch ability arc button press (ui/TouchControls)
 *   • keyboard Q/W/E/R/F key         (input/InputCapture)
 *   • gamepad A/B/X/Y/Back button     (input/GamepadInput → GamepadSystem)
 *
 * What one activation produces:
 *   • sound  → "uiClick" — a snappy button tick, deliberately DISTINCT from the
 *              ability's own in-sim cast voice (abilityCast / castBegin, played
 *              by the combat layer). A refused press (unlearned / on cooldown /
 *              no valid target) plays "uiDenied" so the press still answers, and
 *              a PASSIVE tile (isPassiveOnly — pressing it does nothing) plays a
 *              soft neutral "uiHover" tick instead of the active-cast click.
 *   • haptic → navigator.vibrate a short pulse on devices that support it
 *              (mobile / tablet); a no-op everywhere else.
 *
 * ONE cue per activation — the de-dupe: a single physical press can reach here
 * twice (a touch/mouse button press that ALSO resolves into a cast, or a tile
 * press racing its keyboard shortcut). Two calls for the SAME slot within
 * {@link ABILITY_CUE_DEDUPE_MS} collapse to a single cue, so a press never
 * double-clicks. Different slots never de-dupe each other.
 *
 * `audioSystem.playSfx` no-ops until the AudioContext is unlocked and already
 * honours the SFX mute + volume, so this is always safe to call. Everything is
 * DOM-guarded and the sound/haptic/clock seams are injectable, so it runs (and
 * is asserted) in the non-DOM unit-test env too.
 */
import type { AbilitySlot } from "@ggd/shared/sim/intents";
import { audioSystem } from "../audio";

/** Two calls for the SAME slot within this window (ms) collapse to one cue. */
export const ABILITY_CUE_DEDUPE_MS = 70;

/** In-match HUD voice sits under the combat layer — quieter than lobby chrome. */
const CUE_VOLUME = 0.6;

/** Haptic pulses (ms): crisp tap for a cast, stutter for refusal, soft for passive. */
const HAPTIC_TAP = 12;
const HAPTIC_DENIED: readonly number[] = [8, 22, 8];
const HAPTIC_SOFT = 6;

export interface AbilityCueOptions {
  /** the press was refused — unlearned, on cooldown, or no valid target. */
  denied?: boolean;
  /**
   * the tile is a PASSIVE-only ability (isPassiveOnly): pressing it does nothing
   * gameplay-wise, so play a soft neutral tick, NOT the active-cast click. Takes
   * precedence over `denied` (a passive is never a refused active).
   */
  passive?: boolean;
  /** inject the SFX sink (tests); defaults to the live audio singleton. */
  play?: (event: string, opts?: { volume?: number }) => void;
  /** inject the haptic sink (tests); defaults to navigator.vibrate (guarded). */
  vibrate?: (pattern: number | number[]) => boolean;
  /** inject the clock (tests); defaults to performance.now / Date.now. */
  now?: () => number;
}

let lastSlot: AbilitySlot | null = null;
let lastAt = Number.NEGATIVE_INFINITY;

/** Clear the de-dupe memory. TESTS ONLY (each case starts from a clean slate). */
export function resetAbilityCue(): void {
  lastSlot = null;
  lastAt = Number.NEGATIVE_INFINITY;
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function defaultVibrate(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * Fire the press cue for one Q/W/E/R/EX activation. Returns true when the cue
 * actually played, false when it was de-duped (a second call for the same slot
 * inside the window) — so a button press that also triggers a cast still yields
 * exactly one click.
 */
export function abilityActivationCue(slot: AbilitySlot, opts: AbilityCueOptions = {}): boolean {
  const now = (opts.now ?? defaultNow)();
  if (slot === lastSlot && now - lastAt < ABILITY_CUE_DEDUPE_MS) return false;
  lastSlot = slot;
  lastAt = now;

  // a key / tap / click / pad press is a user gesture — unlock autoplay
  // (idempotent, and a no-op before any AudioContext exists, e.g. in tests).
  audioSystem.unlock();

  const play = opts.play ?? ((event, o) => void audioSystem.playSfx(event, o));
  // passive → soft neutral tick; else denied → refusal; else the button click.
  const event = opts.passive ? "uiHover" : opts.denied ? "uiDenied" : "uiClick";
  play(event, { volume: CUE_VOLUME });

  const vibrate = opts.vibrate ?? defaultVibrate;
  const haptic = opts.passive ? HAPTIC_SOFT : opts.denied ? [...HAPTIC_DENIED] : HAPTIC_TAP;
  vibrate(haptic);
  return true;
}
