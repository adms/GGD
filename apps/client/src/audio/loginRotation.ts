/**
 * audio/loginRotation — the login screen's background theme.
 *
 * HISTORY. Task #88 gave the auth screen a TWO-track rotation — the epic title
 * theme and a serene high-soprano nocturne (`menuNocturne`) alternating every
 * whole loop. Task #134 moved the nocturne OFF the login screen (it is now the
 * ranked-ladder bed — see ui/platform/LeaderboardPanel + audio/bgmOverride), so
 * login plays ONLY the epic `menu` theme again.
 *
 * The rotation is therefore now SINGLE-THEME. Rather than tear the machine out
 * — and with it the two hard-won failure guards below, which a re-added theme
 * would need again — it is kept and degenerates trivially: `LOGIN_THEMES` holds
 * one entry, so every step hands back `menu` and no swap ever fires. The mixer's
 * same-scene `playBgm` is a no-op, so a single-theme rotation costs nothing.
 *
 * WHY THE SEGMENT ARITHMETIC STILL HOLDS: `menu` is 3 763 200 samples =
 * 85.333 s (the pack's 1 881 600-sample loop GRID x 2 — see
 * tools/bgm-gen/src/ggd/music.py). `LOGIN_SEGMENT_MS` is one whole loop of it,
 * which is the point that was written to be cut. With one theme nothing is cut,
 * but the constant stays honest for the day a second login theme returns.
 *
 * Kept free of React and WebAudio like the rest of audio/: the shell that owns
 * the timer is ui/useAudio's `useLoginTheme`.
 */
import type { AudioScene } from "./types";

/**
 * The login rotation, in play order. SINGLE-THEME since task #134: the epic
 * title theme is the game's identity and the only login bed. Index 0 is what a
 * fresh visit opens on. Re-adding a second login theme is a one-line push here
 * (the machine below already handles ≥2 entries) — but the serene nocturne is
 * deliberately NOT one of them any more; it belongs to the leaderboard.
 */
export const LOGIN_THEMES: readonly AudioScene[] = ["menu"];

/**
 * How long each theme holds the screen, in ms. 85 333 ms = 3 763 200 samples at
 * 44.1 kHz = exactly one loop of the `menu` bed. With a single theme this only
 * bounds how long the machine waits before a no-op re-check; it stays exact so a
 * future second login track (which must match the loop grid) lands its crossfade
 * on the loop join rather than mid-phrase.
 */
export const LOGIN_SEGMENT_MS = 85_333;

/**
 * Which theme is playing on the `index`-th segment. Wraps, and tolerates a
 * negative or non-finite index (a clock that went backwards must not blank the
 * bed), so callers can hold a free-running counter. With a single theme this is
 * constant `menu`, but the wrap arithmetic is retained for the multi-theme case.
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

/** Whether a scene is one of the login rotation's themes (now just `menu`). */
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
 * SINGLE-THEME NOW (task #134): every `theme` handed back is `menu` — the index
 * still advances one segment at a time, but `loginThemeAt` wraps a one-element
 * array, so nothing ever swaps. The two guards below therefore no longer protect
 * an audible transition; they are retained because they cost nothing and are
 * exactly what a re-added second theme would need:
 *
 * 1. "THE SECOND TRACK NEVER PLAYS." The segment is measured from
 *    `bedStartedAtMs` — when the file that is ACTUALLY PLAYING started — not
 *    from mount. Until a bed exists the machine returns un-armed polls and holds
 *    theme 0.
 *
 * 2. "BOTH TRACKS PLAY AT ONCE." A step that is armed records the anchor it
 *    armed against, and refuses to re-arm until the anchor CHANGES, so the
 *    machine advances exactly ONE theme per segment rather than flipping every
 *    tick off a stale start time.
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
