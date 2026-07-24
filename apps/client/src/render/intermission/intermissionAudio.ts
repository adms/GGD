/**
 * intermissionAudio — the INTERMISSION scene's own SFX emits (task #38).
 *
 * ONE cue, fired through the shared mixer (`audioSystem.playSfx`, SFX bus) so
 * the SFX slider/mute AND the task-#62 test-mode silence gate apply to it
 * exactly like every other cue — this module never builds its own AudioContext:
 *
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
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RECESS BELL IS GONE — 「商店音樂播放 BGM 就好，不要變成鐘聲」(task #190)
 * ═══════════════════════════════════════════════════════════════════════════
 * This module used to ring `recessBell` once on scene entry: task #124's
 * cheerful 下課打鐘 school chime. The owner reported the shop's music as
 * 「整個被鐘聲取代掉」 and asked for the BGM, plain. It is removed, and the
 * reason is worth writing down because the obvious suspect was the wrong one.
 *
 * The BGM was NEVER a bell. `content/assets/audio/bgm/intermission.mp3` is the
 * city-pop 街の合間 track, and MEASURED it opens on exactly the Rhodes Dm9 its
 * score describes — an FFT of its first 2.6 s peaks at 146.5 / 174.6 / 220.0 /
 * 261.5 / 329.6 Hz (D3 F3 A3 C4 E4), spectral flatness 0.0095. `recessBell.mp3`
 * over the same window is two near-pure partials (349.2 / 698.5 Hz, flatness
 * 0.00000). The track was fine; the CHIME WAS ON TOP OF IT.
 *
 * And it was on top of it for a long time. The clip is 26.03 s of キンコンカン
 * コン plus decay, at gain 0.55, laid over a 60 s prep window whose music
 * deliberately breathes in from near-silence. For the first 43 % of every shop
 * visit the loudest thing on the SFX bus was a school bell and the quietest was
 * the music — which is precisely "the music got replaced by a bell".
 *
 * The clip still ships and stays credited on the 版權聲明 page (the 効果音ラボ
 * authorisation is per-CLIP, not per-emit); it is filed `unreachable` in
 * `audio/sfxReachability` with this reason, so the page tells the truth about
 * it. Do not re-add the emit here: the ONE-BELL-NOT-TWO analysis this header
 * used to carry argued only about a SECOND ring, and the owner has since ruled
 * on the first.
 *
 * Kept as a pure module (injected `SfxPort` + timer fns) so it is unit-testable
 * without a WebGL scene or a real AudioContext — see intermissionAudio.test.ts.
 */

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
