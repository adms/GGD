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
 *   • WORDS   → `ui/castAnnounce.announceCastAttempt`, which turns a refused
 *               press into a readable sentence (冷卻中還有 3 秒 / 魔力不足 /
 *               尚未學習) and shakes the button. Hung off THIS funnel on purpose:
 *               every input path already comes through here, so the keyboard —
 *               the path the playtest actually pressed — gets the explanation
 *               without `input/InputCapture` growing any HUD knowledge.
 *
 * The announcement also CORRECTS the tone. `InputCapture` can only pass
 * `denied: !ability` (i.e. rank 0), so pressing a learned-but-cooling or
 * mana-starved ability used to play the cheerful click — feedback that actively
 * lied. When the announcement returns a refusal, the refusal sound wins.
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
import type { ChampionAbilitySlot } from "@ggd/shared/sim/intents";
import { audioSystem } from "../audio";
import { announceCastAttempt, type CastAnnouncement } from "./castAnnounce";

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
  /**
   * inject the "explain this press" sink (tests); defaults to the live
   * `castAnnounce.announceCastAttempt`. Pass `() => null` to get the pre-#P7
   * sound-only behaviour in a test that does not want a HUD store.
   */
  announce?: (slot: ChampionAbilitySlot) => CastAnnouncement;
}

let lastSlot: ChampionAbilitySlot | null = null;
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
 * Fire the press cue for one Q/W/E/R/EX/天生 activation. Returns true when the cue
 * actually played, false when it was de-duped (a second call for the same slot
 * inside the window) — so a button press that also triggers a cast still yields
 * exactly one click.
 */
export function abilityActivationCue(slot: ChampionAbilitySlot, opts: AbilityCueOptions = {}): boolean {
  const now = (opts.now ?? defaultNow)();
  if (slot === lastSlot && now - lastAt < ABILITY_CUE_DEDUPE_MS) return false;
  lastSlot = slot;
  lastAt = now;

  // a key / tap / click / pad press is a user gesture — unlock autoplay
  // (idempotent, and a no-op before any AudioContext exists, e.g. in tests).
  audioSystem.unlock();

  // Explain the press BEFORE choosing the sound: a predicted refusal the caller
  // could not know about (cooling down, out of mana) has to flip the tone, or
  // the player hears "yes" and sees nothing happen — P7 exactly.
  const announce = opts.announce ?? announceCastAttempt;
  const notice = announce(slot);
  const denied = opts.denied === true || notice !== null;
  // A pure-passive tile answers softly even when it "refuses": nothing went
  // wrong, it simply is not a button.
  const passive = isPassiveNotice(notice, opts);

  const play = opts.play ?? ((event, o) => void audioSystem.playSfx(event, o));
  // passive → soft neutral tick; else denied → refusal; else the button click.
  const event = passive ? "uiHover" : denied ? "uiDenied" : "uiClick";
  play(event, { volume: CUE_VOLUME });

  const vibrate = opts.vibrate ?? defaultVibrate;
  const haptic = passive ? HAPTIC_SOFT : denied ? [...HAPTIC_DENIED] : HAPTIC_TAP;
  vibrate(haptic);
  return true;
}

/**
 * A refusal is "soft" when the tile was never castable in the first place — the
 * caller said so (`opts.passive`, set by the bars from `isPassiveOnly`), or the
 * announcement came back with the 被動 sentence. Everything else is a real
 * refusal and gets the error beep.
 */
function isPassiveNotice(notice: CastAnnouncement, opts: AbilityCueOptions): boolean {
  if (opts.passive === true) return true;
  return notice !== null && notice.text.includes(PASSIVE_MARK);
}

/** The fragment shared by both 被動 sentences (castFeedback + castAnnounce). */
const PASSIVE_MARK = "被動";
