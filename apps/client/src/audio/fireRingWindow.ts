/**
 * audio/fireRingWindow — "how many seconds are left on the round clock at the
 * moment the 火環 actually starts burning". ONE number, DERIVED from the same
 * `config.match@1` document the game-server arms the ring from, never authored
 * twice.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (task #132, false-completion shape S3)
 * ---------------------------------------------------------------------------
 * The tension bed and the minimap danger rim are CUES FOR A MECHANIC. The
 * mechanic ignites at `match.fireRing.startSec` of combat-elapsed time; the
 * round clock the HUD shows counts DOWN from `match.combatMaxSec`. So the
 * moment the burn begins is, in the clock the client actually has:
 *
 *     phaseSecondsLeft === combatMaxSec - fireRing.startSec
 *
 * That relationship used to be a literal `30` in audio/scene.ts. The shipped
 * config is 240 / 180 → 60, so for months the BGM swapped to the tension bed
 * and the minimap rim started pulsing THIRTY SECONDS AFTER champions had
 * already begun burning to death. No error, no crash, no failing test: the cue
 * simply pointed at the wrong instant. Exactly the pathology this batch exists
 * to kill — green, tested, on disk, and wrong on screen.
 *
 * Nothing tied the constant to the config, so nothing could notice. Two guards
 * now do:
 *   1. this derivation, so editing `config.match.json` moves the cue with the
 *      mechanic (see {@link fireRingWindowSec});
 *   2. {@link noteFireRingIgnition}, a RUNTIME tripwire fed by the sim's own
 *      `fireRingStart` event — if the derived instant and the real instant ever
 *      part company again, the console says so with both numbers.
 *
 * ---------------------------------------------------------------------------
 * WHY `FIRE_RING_SEC` IS AN `export let` AND MUST STAY ONE
 * ---------------------------------------------------------------------------
 * `ui/hud/Minimap.tsx` (another lane's file) imports `FIRE_RING_SEC` as a
 * number and does arithmetic on it. An ESM named import is a LIVE BINDING, so
 * re-assigning this `let` inside this module updates the minimap's view of it
 * for free — the rim and the bed stay one number without reaching into a file
 * this lane does not own. Turning it back into a `const` (or copying it into
 * another module) silently re-forks the two cues. Don't.
 *
 * The value starts at the no-ring fallback and is re-resolved every time
 * {@link fireRingWindowSec} runs — which is on every `sceneForMatch` call, i.e.
 * at least once per HUD clock second of a live match, long before the window
 * matters. `subscribeContentBoot` additionally refreshes it the instant the
 * content registries are populated, so a page that never enters a match still
 * holds the authored number.
 */
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc } from "@ggd/shared/content";
import { subscribeContentBoot } from "../content/bootContent";

/**
 * Fallback window when the content tree carries NO fire ring (a skeleton boot,
 * a unit test, or an operator who authored no `match.fireRing` block). There is
 * no burn to cue in that case, so this is the legacy generic "the round clock
 * is about to run out" pressure window — deliberately the historical 30 s, so
 * removing the ring from content restores the pre-#132 behaviour exactly
 * instead of silently muting the tension bed.
 */
export const NO_RING_FALLBACK_SEC = 30;

/** The seconds fields of `config.match@1`'s `match` block that this consumes. */
export interface FireRingClockSource {
  combatMaxSec?: number;
  fireRing?: { startSec?: number } | undefined;
}

/**
 * PURE core: seconds left on the combat clock when the ring ignites.
 *
 *   • no ring authored            → {@link NO_RING_FALLBACK_SEC}
 *   • ring ignites at/after the
 *     phase cap (startSec >= max) → 0, i.e. NEVER cue it. The phase force-ends
 *                                   before the ring can burn anything, so a
 *                                   tension bed would be lying. (The `config@1`
 *                                   schema is supposed to forbid this; we do
 *                                   not trust it, because `Configs.tryGet` is
 *                                   not re-validated at read time.)
 *   • otherwise                   → combatMaxSec - startSec
 */
export function fireRingWindowSecFrom(m: FireRingClockSource | null | undefined): number {
  const combatMaxSec = m?.combatMaxSec;
  const startSec = m?.fireRing?.startSec;
  if (typeof combatMaxSec !== "number" || !Number.isFinite(combatMaxSec)) return NO_RING_FALLBACK_SEC;
  if (typeof startSec !== "number" || !Number.isFinite(startSec)) return NO_RING_FALLBACK_SEC;
  const window = combatMaxSec - startSec;
  if (!(window > 0)) return 0;
  // A ring that ignites at t=0 would burn for the whole phase; clamp to the
  // phase length so the number can never exceed the clock it is compared to.
  return Math.min(combatMaxSec, window);
}

/**
 * Seconds left on the combat clock when the fire ring ignites. LIVE BINDING —
 * see the header. Read it, never re-declare it.
 */
export let FIRE_RING_SEC: number = NO_RING_FALLBACK_SEC;

/**
 * Re-resolve {@link FIRE_RING_SEC} from the loaded content registry and return
 * it. A Map lookup plus two subtractions — no I/O, safe to call per HUD tick.
 * Callers that want the pure form (tests, replay tooling) should use
 * {@link fireRingWindowSecFrom} with an explicit doc.
 */
export function fireRingWindowSec(): number {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  FIRE_RING_SEC = doc?.schema === "config@1" ? fireRingWindowSecFrom(doc.match) : NO_RING_FALLBACK_SEC;
  return FIRE_RING_SEC;
}

// Content boot populates `Configs` asynchronously; latch the authored number
// the moment it lands so a client sitting in the lobby already holds it.
// Passive (a Set.add) — it does NOT kick a load off, so importing the audio
// layer in a test still fetches nothing.
subscribeContentBoot(() => {
  fireRingWindowSec();
});
// ...and resolve once at import time, for the case where boot already settled.
fireRingWindowSec();

// ---------------------------------------------------------------------------
// RUNTIME TRIPWIRE — the sim's own event vs. this derivation
// ---------------------------------------------------------------------------

/** How far the observed ignition may sit from the derived one before we shout.
 *  `phaseSecondsLeft` is a ceil() of a 30 Hz tick counter and the event is
 *  drained on a render frame, so ±1 s is ordinary quantisation. 1.5 s is the
 *  smallest threshold that never fires on rounding alone. */
const DRIFT_TOLERANCE_SEC = 1.5;

let driftReported = false;

/**
 * Called from the per-frame combat-SFX mapper when the sim's `fireRingStart`
 * event arrives — the ONE moment where the client is told, by the authority,
 * exactly when the ring began to burn.
 *
 * This does not change any behaviour; it exists so the S3 shape cannot come
 * back QUIETLY. If someone re-hardcodes the window, edits `combatMaxSec`
 * without the ring, or the server stops honouring the doc, the very first round
 * played prints both numbers and names this file. A silent cue is the failure
 * mode we are guarding against, so the alarm is `console.error`, not `warn`.
 *
 * @param phaseSecondsLeft the HUD's combat clock at the instant of ignition
 */
export function noteFireRingIgnition(phaseSecondsLeft: number): void {
  if (driftReported) return;
  if (!Number.isFinite(phaseSecondsLeft)) return;
  // No clock (not connected, phase not running, or a synthetic event in a unit
  // test) → nothing to compare against. A real ignition always happens with
  // seconds still on the combat timer, so this only suppresses noise, never a
  // genuine drift: a ring that ignites at 5 s left against a derived 0 still
  // trips the alarm below.
  if (!(phaseSecondsLeft > 0)) return;
  const derived = fireRingWindowSec();
  if (Math.abs(phaseSecondsLeft - derived) <= DRIFT_TOLERANCE_SEC) return;
  driftReported = true;
  console.error(
    `[fireRing] CUE DRIFT (task #132): the sim ignited the ring with ${phaseSecondsLeft}s left on ` +
      `the combat clock, but the client derived ${derived}s from config.match@1 ` +
      `(combatMaxSec - fireRing.startSec). The tension BGM and the minimap danger rim are ` +
      `therefore ${Math.round(phaseSecondsLeft - derived)}s out of step with the burn. ` +
      `Fix audio/fireRingWindow.ts or content/config/config.match.json — do not paper over it.`,
  );
}

/** Test-only: re-arm the one-shot drift alarm. */
export function __resetFireRingDriftAlarm(): void {
  driftReported = false;
}
