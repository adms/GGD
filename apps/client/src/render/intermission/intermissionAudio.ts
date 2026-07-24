/**
 * intermissionAudio — the INTERMISSION scene's own SFX emits (tasks #124, #38).
 *
 * Two cues, both fired through the shared mixer (`audioSystem.playSfx`, SFX bus)
 * so the SFX slider/mute AND the task-#62 test-mode silence gate apply to them
 * exactly like every other cue — this module never builds its own AudioContext:
 *
 *   • recessBell (#124) — the cheerful 下課打鐘 school-recess bell, a ONE-SHOT
 *     rung as the 中場/備戰 window opens. (The clip is authored by task #124; if
 *     the map has no `recessBell` entry yet, `playSfx` simply returns false and
 *     the emit is a silent no-op until the asset lands — being unmapped costs
 *     silence, never a throw.)
 *   • merchantAmbience (#38) — the market-crowd「がやがや」murmur bed that plays
 *     UNDER the intermission while the stall is shown. It is a LOOPING bed
 *     (flagged in `sfxManifest.SFX_LOOPABLE`), but the mixer's one-shot
 *     `playSfx` is the only emit seam this layer owns, and the map entry pins
 *     `maxConcurrent: 1`. So the loop is kept alive by a lifecycle-owned
 *     re-arm timer: while the bed is sounding every re-arm is a no-op (the
 *     concurrency gate rejects a second voice); the first re-arm AFTER the clip
 *     reaches its natural end restarts it. `stop()` clears the timer, so nothing
 *     is left ticking once the scene is disposed (no leak).
 *
 * ONE BELL, NOT TWO — DELIBERATE. A second "break is ending" ring was
 * considered and rejected on the numbers, not on taste:
 *   • the clip is 26.03 s long (a full キンコンカンコン plus a long decay tail),
 *     and the prep window is 60 s (PhaseMachine `intermissionTicks`). A closing
 *     ring would have to START at t≈34 s to finish before combat — the middle
 *     of the window, which reads as random rather than as "time is up";
 *   • start it any later and it is still sounding when the phase ends, so the
 *     school bell rings over the opening seconds of the fight. `playSfx` is
 *     fire-and-forget (the mixer exposes no stop-one-voice seam), so a dispose
 *     could not cut it off;
 *   • the last five seconds already belong to task #95, whose `countFinal`
 *     fires on the 1 s edge. A bell on top of it is the "so dense it sounds
 *     broken" stacking the brief warns against.
 * The single opening ring at t=0 lands clean: it is done by t≈26 s, a full 34 s
 * before the countdown starts, so the two cues never overlap.
 *
 * Kept as a pure module (injected `SfxPort` + timer fns) so it is unit-testable
 * without a WebGL scene or a real AudioContext — see intermissionAudio.test.ts.
 */

/** SFX event key: the 下課打鐘 school-recess bell (task #124). */
export const RECESS_BELL = "recessBell";
/** SFX event key: the looping market-crowd ざわめき bed (task #38). */
export const MARKET_AMBIENCE = "merchantAmbience";

/**
 * How often the ambience loop re-arms itself (ms). The clip is ~50 s and its map
 * entry is `maxConcurrent: 1`, so a re-arm while it is still sounding is a no-op;
 * only the first tick after its natural end restarts it. This bounds the seam
 * gap at the loop point to ≤ this interval — inaudible on a background murmur.
 */
export const AMBIENCE_REARM_MS = 2000;

/** The single mixer method this layer needs (the `audioSystem` singleton satisfies it). */
export interface SfxPort {
  /** Fire a one-shot mapped SFX; false when unmapped / gated / silenced. */
  playSfx(event: string): boolean;
}

/** Injectable timer seam (defaults to the globals; overridden in tests). */
export interface AmbienceTimers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/** Handle to a running ambience loop — stop it (and clear its timer) on dispose. */
export interface MarketAmbienceHandle {
  /** Stop re-arming the bed. Idempotent; safe to call after it is already stopped. */
  stop(): void;
}

const defaultTimers: AmbienceTimers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

/**
 * Ring the 下課打鐘 recess bell ONCE, as the intermission opens. Returns whether
 * the mixer actually started it (false = unmapped / autoplay-locked / muted /
 * test-mode silent — all silent no-ops, never a throw).
 */
export function playRecessBell(audio: SfxPort): boolean {
  return audio.playSfx(RECESS_BELL);
}

/**
 * Start the market-crowd ambience bed and keep it looping until `stop()`.
 *
 * Fires immediately, then re-arms every {@link AMBIENCE_REARM_MS} ms; the
 * `maxConcurrent: 1` gate makes each re-arm a no-op while the bed is still
 * sounding, so it restarts only once the clip has played itself out. `stop()`
 * clears the re-arm timer so nothing keeps ticking after the scene is disposed.
 */
export function startMarketAmbience(
  audio: SfxPort,
  opts: { timers?: AmbienceTimers; rearmMs?: number } = {},
): MarketAmbienceHandle {
  const timers = opts.timers ?? defaultTimers;
  const rearmMs = opts.rearmMs ?? AMBIENCE_REARM_MS;
  // Kick it off immediately (so the bed is under the scene from the first frame),
  // then let the re-arm timer keep it alive across the clip's natural end.
  audio.playSfx(MARKET_AMBIENCE);
  let handle: unknown = timers.setInterval(() => {
    audio.playSfx(MARKET_AMBIENCE);
  }, rearmMs);
  return {
    stop(): void {
      if (handle === null) return;
      timers.clearInterval(handle);
      handle = null;
    },
  };
}
