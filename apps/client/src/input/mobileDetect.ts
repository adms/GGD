/**
 * mobileDetect — pure predicates for iPhone/touch support (iOS Safari and
 * WKWebView are the targets; Android is explicitly out of scope). All
 * functions take plain data so they unit-test in node; `readTouchEnv()` is
 * the only DOM-touching reader, and the dev harness can force touch mode via
 * `globalThis.__ggdForceTouch = true` (browser-pane emulation without a
 * real touchscreen — same spirit as the `__ggdFakePads` seam).
 */

export interface TouchEnv {
  /** `'ontouchstart' in window` */
  hasTouchStart: boolean;
  /** `matchMedia("(pointer: coarse)").matches` */
  coarsePointer: boolean;
  /** dev harness override (`globalThis.__ggdForceTouch`) */
  forced: boolean;
}

/** Touch device = touch events AND a coarse primary pointer (or forced). */
export function isTouchDevice(env: TouchEnv): boolean {
  return env.forced || (env.hasTouchStart && env.coarsePointer);
}

/** Read the live environment (safe when window/matchMedia are absent). */
export function readTouchEnv(): TouchEnv {
  const g = globalThis as { __ggdForceTouch?: boolean };
  if (typeof window === "undefined") {
    return { hasTouchStart: false, coarsePointer: false, forced: g.__ggdForceTouch === true };
  }
  return {
    hasTouchStart: "ontouchstart" in window,
    coarsePointer:
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false,
    forced: g.__ggdForceTouch === true,
  };
}

export type Quality = "mobile" | "desktop";

/**
 * Auto quality tier: touch devices AND weak CPUs (<= 4 logical cores) get the
 * "mobile" tier — hardware scaling capped at 1.5x and halved particle budgets.
 */
export function detectQuality(opts: { touch: boolean; hardwareConcurrency: number }): Quality {
  return opts.touch || opts.hardwareConcurrency <= 4 ? "mobile" : "desktop";
}

/** Live auto-detect (navigator-safe). */
export function autoQuality(): Quality {
  const hc = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 8) : 8;
  return detectQuality({ touch: isTouchDevice(readTouchEnv()), hardwareConcurrency: hc });
}

/** The game is landscape-only on touch devices: portrait shows the overlay. */
export function shouldShowRotateOverlay(opts: {
  touch: boolean;
  width: number;
  height: number;
}): boolean {
  return opts.touch && opts.height > opts.width;
}

/**
 * Touch controls render for the single local player only — couch split-screen
 * is a TV/pad mode and keeps its pad HUD (touch joystick would be ambiguous).
 */
export function showTouchControls(opts: { touch: boolean; inGame: boolean; couch: boolean }): boolean {
  return opts.touch && opts.inGame && !opts.couch;
}
