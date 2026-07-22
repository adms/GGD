/**
 * audio/loginRotation — PURE rotation rule for the login screen's two themes.
 *
 * 「登入頁主題曲可以有第二首輪播」(task #88). The auth screen alternates between
 * the epic title theme and a serene high-soprano nocturne. The two are
 * deliberately opposite — grandeur, then stillness — so the rotation is the
 * point, not a way of hiding repetition.
 *
 * WHY A FIXED SEGMENT AND NOT "PLAY EACH FILE ONCE THROUGH":
 * both login beds are exactly 3 763 200 samples = 85.333 s (the pack's
 * 1 881 600-sample loop GRID x 2 — see tools/bgm-gen/src/ggd/music.py), so ONE
 * constant is simultaneously one whole loop of `menu` and one whole loop of
 * `menuNocturne`. Timing the swap off the bed's own start therefore always
 * lands it on a loop boundary of whichever track is playing, which is the one
 * moment in either file that was written to be cut (both are seamless
 * self-joins there). No file needs to announce its own length, and no per-track
 * table can drift out of sync with the renders.
 *
 * Kept free of React and WebAudio like the rest of audio/: the shell that owns
 * the timer is ui/useAudio's `useLoginTheme`.
 */
import type { AudioScene } from "./types";

/**
 * The login rotation, in play order. Index 0 is what a fresh visit opens on:
 * the serene nocturne (寧靜女聲) opens, then the epic title theme answers it —
 * stillness first, then grandeur, per the user (「主題曲 · 寧靜女聲 作為第一首
 * 再輪替第二首」). Extending this array is all a third login theme would need.
 */
export const LOGIN_THEMES: readonly AudioScene[] = ["menuNocturne", "menu"];

/**
 * How long each theme holds the screen, in ms. 85 333 ms = 3 763 200 samples at
 * 44.1 kHz = exactly one loop of BOTH login beds. Changing a login track's
 * length without changing this would put the crossfade in the middle of a
 * phrase, so the two are a pair.
 */
export const LOGIN_SEGMENT_MS = 85_333;

/**
 * Which theme is playing on the `index`-th segment. Wraps, and tolerates a
 * negative or non-finite index (a clock that went backwards must not blank the
 * bed), so callers can hold a free-running counter.
 */
export function loginThemeAt(index: number): AudioScene {
  const n = LOGIN_THEMES.length;
  if (!Number.isFinite(index)) return LOGIN_THEMES[0]!;
  const i = ((Math.floor(index) % n) + n) % n;
  return LOGIN_THEMES[i]!;
}

/**
 * ms left before the current theme should hand over, given when the CURRENT
 * bed started playing. Clamped into [0, LOGIN_SEGMENT_MS] so a stale or future
 * `startedAtMs` (a suspended tab, a clock jump) can neither schedule a timer in
 * the past nor park one beyond a segment — the caller simply re-arms.
 */
export function loginSegmentRemainingMs(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return LOGIN_SEGMENT_MS;
  const elapsed = nowMs - startedAtMs;
  if (!(elapsed > 0)) return LOGIN_SEGMENT_MS;
  return Math.min(LOGIN_SEGMENT_MS, Math.max(0, LOGIN_SEGMENT_MS - elapsed));
}

/** Whether a scene is one of the login rotation's themes. */
export function isLoginTheme(scene: string | null): boolean {
  return scene !== null && (LOGIN_THEMES as readonly string[]).includes(scene);
}

// ---------------------------------------------------------------------------
// the rotation state machine
// ---------------------------------------------------------------------------

/**
 * How often to look for a bed that has not started yet. The rotation can only
 * be armed once something is actually playing (the autoplay unlock is a user
 * gesture that may never come), so until then the caller re-polls — 250 ms,
 * i.e. four checks a second on the login screen only, and none once armed.
 */
export const LOGIN_ROTATION_POLL_MS = 250;

/**
 * Rotation state. Free-running `index` (never reset by the machine itself, so
 * the counter survives a re-poll); `armedAnchorMs` is the bed start the current
 * hold was measured from; `holding` records that the last step handed out a
 * whole-segment wait rather than a poll.
 */
export interface LoginRotationState {
  index: number;
  armedAnchorMs: number | null;
  holding: boolean;
}

export const LOGIN_ROTATION_INITIAL: LoginRotationState = {
  index: 0,
  armedAnchorMs: null,
  holding: false,
};

export interface LoginRotationStep {
  /** the theme that should be playing right now */
  theme: AudioScene;
  /** ms until the caller must step again */
  waitMs: number;
  /** true = `waitMs` is a whole segment (the theme advances when it expires);
   *  false = nothing is playing yet, so this is just a re-poll */
  armed: boolean;
}

/**
 * Advance the login rotation. PURE: the caller owns the timer and passes in the
 * bed anchor + clock, so the whole rule is testable without WebAudio or React.
 *
 * THE TWO FAILURE MODES THIS SHAPE EXISTS TO PREVENT:
 *
 * 1. "THE SECOND TRACK NEVER PLAYS." The segment is measured from
 *    `bedStartedAtMs` — when the file that is ACTUALLY PLAYING started — not
 *    from mount. The bed does not start until the first pointer/key gesture
 *    unlocks the AudioContext, which can be many seconds after the auth screen
 *    appears; timing off mount would put the first swap somewhere in the middle
 *    of track one and, worse, would fire while nothing was playing at all.
 *    Until a bed exists the machine returns un-armed polls and holds theme 0.
 *
 * 2. "BOTH TRACKS PLAY AT ONCE." A step that is armed records the anchor it
 *    armed against. When the hold expires the bed has NOT been replaced yet
 *    (React has not re-rendered and the new buffer may still be decoding), so
 *    an unguarded re-arm would read the OLD start time, compute ~0 ms remaining
 *    and flip again immediately — a runaway that asks the mixer for a new bed
 *    every tick. Requiring a DIFFERENT anchor before arming again is what makes
 *    the machine advance exactly ONE theme per segment. (The mixer's own
 *    single-bed crossfade is the second line of defence; this is the first.)
 */
export function stepLoginRotation(
  state: LoginRotationState,
  input: { bedStartedAtMs: number | null; nowMs: number },
): { step: LoginRotationStep; next: LoginRotationState } {
  // Coming back from an armed hold means that segment just ended → next theme.
  const index = state.holding ? state.index + 1 : state.index;
  const theme = loginThemeAt(index);
  const anchor = input.bedStartedAtMs;
  if (anchor === null || anchor === state.armedAnchorMs) {
    // nothing playing yet, or still the bed we already counted from
    return {
      step: { theme, waitMs: LOGIN_ROTATION_POLL_MS, armed: false },
      next: { index, armedAnchorMs: state.armedAnchorMs, holding: false },
    };
  }
  return {
    step: { theme, waitMs: loginSegmentRemainingMs(anchor, input.nowMs), armed: true },
    next: { index, armedAnchorMs: anchor, holding: true },
  };
}
