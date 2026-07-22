/**
 * audio/countdownCue — PURE decision for the "last 5 seconds" countdown that
 * plays at the end of a TIMED PREP PHASE. The HUD store already publishes a
 * whole-second, change-guarded `phaseSecondsLeft` (RoomStore derives it from
 * `phaseTicksLeft`), but it is republished at snapshot rate (~20 Hz) and React
 * re-renders whenever ANY selected field changes — so "seconds left is 3" is
 * seen many times per second. This module owns the once-per-second guard so the
 * AudioDirector can stay a two-line imperative shell (like sfxEdges / footsteps).
 *
 * WHICH PHASES COUNT DOWN (task #38). Originally champSelect only. The
 * intermission is now the real PREP WINDOW — its own scene, a centre-stage shop,
 * and a 60 s content-configured clock (see game-server match/phaseConfig.ts) —
 * so it gets the same ringside bells: the last five seconds are exactly when a
 * player still browsing the merchant needs to be told to ready up. COMBAT is
 * deliberately NOT in the set: its clock running out is a draw resolved on HP,
 * not something the player acts on, and a bell there would read as "cast now".
 *
 * Design:
 *  - 5 s → 2 s fire `countTick` at RISING volume (0.45 / 0.60 / 0.75 / 0.90);
 *    the final second (1 s) fires the distinct, longer `countFinal` at 1.0.
 *    Loudness is the per-call `volume` on playSfx — both clips are peak
 *    normalised to -3 dBFS on disk (content/assets/audio/sfx/fx/MANIFEST.json).
 *  - a cue fires only when the clock has STRICTLY DESCENDED past the last
 *    second we fired for. That single rule kills every double-fire source at
 *    once: React re-renders, 20 Hz snapshot repeats, and timer jitter that
 *    bounces 3 → 4 → 3. It also makes the volume sequence monotonically
 *    increasing by construction.
 *  - the guard REARMS whenever the countdown is not running — a phase outside
 *    the set, a DIFFERENT countdown phase than the one we last fired in, or a
 *    countdown phase with more than LEAD seconds left. So every champ select and
 *    every round's prep window counts down on its own, and the phase length is
 *    irrelevant: 25 s, 60 s or 90 s all reach 5 and ring the same five bells.
 *  - MOUNTING MID-COUNTDOWN: deliberately NOT silent. If the screen appears
 *    with 3 s left (reconnect, late join, a hot-reload), the guard is unarmed
 *    and 3 s fires at ITS volume — the player still gets "3…2…GO" rather than
 *    nothing. Volumes stay tied to the second, never to a counter, so a
 *    partial pickup is still correctly ordered and still ends on countFinal.
 *  - 0 s is silent: countFinal already played on the 1 s edge, which is the
 *    moment the player must react to.
 *
 * COMMITTED — THE PREP WINDOW IS THE ONLY DEADLINE YOU CAN ANSWER EARLY (#95).
 * Champ select's clock is unforgiving: miss it and you are handed a random
 * champion, and it happens ONCE per match. The prep window's is soft (you just
 * stop shopping and fight) and it happens EVERY ROUND — six, eight, ten times a
 * match. Ringing the same four escalating bells at a player who already pressed
 * Ready is the definition of crying wolf: they answered the question, and the
 * phase is only still running because someone ELSE has not.
 *
 * So a COMMITTED sample suppresses the four nagging TICKS (5 s → 2 s) and keeps
 * the single `countFinal` on the last second. The split is deliberate and the
 * two cues genuinely say different things:
 *   ticks      = "act" — a call to action you have already answered → drop it.
 *   countFinal = "brace" — the race-start trill; combat begins NOW and your
 *                hands should be on the keys. Still true after Ready, still
 *                worth exactly one sound.
 * The guard still ADVANCES over a suppressed second, so un-committing (which
 * the server never does mid-window) could never replay the bells you skipped.
 */

/**
 * The phases whose countdown is audible (HUD store `phase` values):
 * champ select, and the intermission prep window (task #38).
 */
export const COUNTDOWN_PHASES: readonly string[] = ["champSelect", "intermission"];

/** True when `phase` is one of the countdown phases. */
export function isCountdownPhase(phase: string): boolean {
  return COUNTDOWN_PHASES.includes(phase);
}

/** Seconds remaining at or below which the countdown is audible. */
export const COUNTDOWN_LEAD_SEC = 5;

/** SFX event for seconds 5..2 (the plain tick). */
export const COUNTDOWN_TICK_EVENT = "countTick";

/** SFX event for the last second — a different, longer, higher clip. */
export const COUNTDOWN_FINAL_EVENT = "countFinal";

/**
 * Per-second volume multiplier, indexed by seconds remaining. Strictly
 * increasing as the clock runs down; the final second is full scale.
 * (index 0 is unused — 0 s never fires.)
 */
export const COUNTDOWN_VOLUMES: readonly number[] = [0, 1.0, 0.9, 0.75, 0.6, 0.45];

/** One cue to hand to `audioSystem.playSfx(event, { volume })`. */
export interface CountdownCue {
  event: string;
  volume: number;
}

/** Guard state carried between samples (one per mounted director). */
export interface CountdownState {
  /** integer second a cue was last fired for; null = armed, nothing fired yet */
  lastFiredSec: number | null;
  /**
   * The countdown phase `lastFiredSec` belongs to. A phase CHANGE rearms the
   * guard outright, so champ select's last bell can never suppress the prep
   * window's first one however the two clocks happen to line up.
   */
  phase: string | null;
}

/** A freshly armed guard (nothing fired). */
export const COUNTDOWN_INITIAL: CountdownState = { lastFiredSec: null, phase: null };

/** What the director samples each time the store publishes. */
export interface CountdownInput {
  /** HUD store `phase` */
  phase: string;
  /** HUD store `phaseSecondsLeft` (whole seconds, already floored server-side) */
  secondsLeft: number;
  /**
   * The local player has already ANSWERED this phase's question — in the prep
   * window, pressed Ready. Suppresses the nagging ticks and keeps only the
   * final "brace" cue (see the module doc). Defaults to false, so every caller
   * that does not know about commitment behaves exactly as before.
   */
  committed?: boolean;
}

export interface CountdownDecision {
  /** the cue to play, or null when this sample is a no-op */
  cue: CountdownCue | null;
  /** guard state to carry into the next sample */
  next: CountdownState;
}

/**
 * The cue a given second should make, or null outside the countdown window.
 * Pure lookup — no guard, no state; `stepCountdown` decides *whether* to fire.
 *
 * `committed` drops the ticks and keeps the final cue (see the module doc).
 */
export function cueForSecond(secondsLeft: number, committed = false): CountdownCue | null {
  if (!Number.isFinite(secondsLeft)) return null;
  const sec = Math.floor(secondsLeft);
  if (sec < 1 || sec > COUNTDOWN_LEAD_SEC) return null;
  const volume = COUNTDOWN_VOLUMES[sec] ?? 1;
  const event = sec === 1 ? COUNTDOWN_FINAL_EVENT : COUNTDOWN_TICK_EVENT;
  if (committed && event === COUNTDOWN_TICK_EVENT) return null;
  return { event, volume };
}

/**
 * Advance the guard with one sample of (phase, secondsLeft). Returns the cue to
 * play (or null) plus the state to keep. Calling this many times with the same
 * second yields exactly ONE cue.
 */
export function stepCountdown(prev: CountdownState, input: CountdownInput): CountdownDecision {
  // not a countdown phase → rearm, so the NEXT one counts down again.
  if (!isCountdownPhase(input.phase)) return { cue: null, next: COUNTDOWN_INITIAL };

  const sec = Number.isFinite(input.secondsLeft) ? Math.floor(input.secondsLeft) : Number.NaN;

  // above the window (incl. a phase that just restarted with a full clock) →
  // rearm and stay silent.
  if (!Number.isFinite(sec) || sec > COUNTDOWN_LEAD_SEC) return { cue: null, next: COUNTDOWN_INITIAL };

  // a DIFFERENT countdown phase than the one we last fired in: treat it as a
  // fresh countdown regardless of where its clock happens to be.
  const armed = prev.phase === null || prev.phase === input.phase ? prev : COUNTDOWN_INITIAL;

  // 0 (or a bogus negative): hold the guard so a clock parked at 0 stays silent
  // instead of re-firing the last second.
  if (sec < 1) return { cue: null, next: armed };

  // already fired for this second — or the clock bounced BACKWARDS (jitter):
  // never fire the same second twice, never fire a quieter cue after a louder.
  if (armed.lastFiredSec !== null && sec >= armed.lastFiredSec) return { cue: null, next: armed };

  // NOTE the guard advances even when `committed` swallows the cue — a
  // suppressed second is CONSUMED, never queued up to fire later.
  return {
    cue: cueForSecond(sec, input.committed === true),
    next: { lastFiredSec: sec, phase: input.phase },
  };
}
