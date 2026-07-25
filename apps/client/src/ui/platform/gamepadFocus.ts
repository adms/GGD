/**
 * gamepadFocus — a minimal gamepad→DOM-focus bridge for the menu screens
 * (#197: the gamepad must drive the WHOLE UI flow, not just combat). The QR
 * device-login screen has NO text entry precisely so a keyboard-less handheld
 * can reach it on a pad: D-pad moves focus between the screen's buttons, A
 * activates the focused one, B triggers the "back/cancel" action.
 *
 * The traversal math is a PURE reducer (nextFocusIndex) so it is unit-testable
 * without a browser or a physical controller; the controller below is a thin
 * rAF poll that turns Gamepad button EDGES (press, not hold) into those moves.
 */

/** Directions the D-pad / left-stick can request. */
export type NavDir = "up" | "down" | "left" | "right";

/**
 * Next focus index for a linear button list. up/left move toward 0, down/right
 * toward the end; both ends CLAMP (no wrap) so a pad user always knows where the
 * edges are. Returns `current` unchanged for an empty list.
 */
export function nextFocusIndex(current: number, count: number, dir: NavDir): number {
  if (count <= 0) return current;
  const cur = Math.max(0, Math.min(current, count - 1));
  const back = dir === "up" || dir === "left";
  const next = back ? cur - 1 : cur + 1;
  return Math.max(0, Math.min(next, count - 1));
}

// Standard-mapping button indices (W3C Gamepad "standard" layout).
const BTN_A = 0;
const BTN_B = 1;
const BTN_UP = 12;
const BTN_DOWN = 13;
const BTN_LEFT = 14;
const BTN_RIGHT = 15;
const STICK_DEADZONE = 0.6;

export interface GamepadFocusCallbacks {
  navigate: (dir: NavDir) => void;
  activate: () => void;
  back: () => void;
}

/**
 * Detect newly-pressed buttons and stick flicks between two polls, returning the
 * high-level intents. Pure over the two snapshots so the edge logic is testable.
 * `prev`/`curr` are button pressed-bit arrays; `axes` is the current stick.
 */
export function gamepadIntents(
  prev: boolean[],
  curr: boolean[],
  prevAxis: NavDir | null,
  currAxis: NavDir | null,
): { navs: NavDir[]; activate: boolean; back: boolean } {
  const pressed = (i: number): boolean => !!curr[i] && !prev[i];
  const navs: NavDir[] = [];
  if (pressed(BTN_UP)) navs.push("up");
  if (pressed(BTN_DOWN)) navs.push("down");
  if (pressed(BTN_LEFT)) navs.push("left");
  if (pressed(BTN_RIGHT)) navs.push("right");
  // Stick flick: a fresh direction that was not held on the previous poll.
  if (currAxis && currAxis !== prevAxis) navs.push(currAxis);
  return { navs, activate: pressed(BTN_A), back: pressed(BTN_B) };
}

/** Resolve the left stick to a cardinal direction, or null inside the deadzone. */
export function axisDir(x: number, y: number): NavDir | null {
  if (Math.abs(x) < STICK_DEADZONE && Math.abs(y) < STICK_DEADZONE) return null;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? "left" : "right";
  return y < 0 ? "up" : "down";
}

/**
 * Poll gamepads on rAF and drive the callbacks. Returns a stop function.
 * `enabled()` lets the caller gate polling to when its screen is actually up.
 * No-op where gamepads or rAF are unavailable (SSR / tests import the pure
 * helpers directly instead of running this).
 */
export function startGamepadFocus(cb: GamepadFocusCallbacks, enabled: () => boolean): () => void {
  if (typeof navigator === "undefined" || typeof requestAnimationFrame === "undefined") {
    return () => {};
  }
  let prevButtons: boolean[] = [];
  let prevAxis: NavDir | null = null;
  let raf = 0;

  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    if (!enabled()) return;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p);
    if (!pad) return;
    const curr = pad.buttons.map((b) => b.pressed);
    const currAxis = axisDir(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const { navs, activate, back } = gamepadIntents(prevButtons, curr, prevAxis, currAxis);
    for (const d of navs) cb.navigate(d);
    if (activate) cb.activate();
    if (back) cb.back();
    prevButtons = curr;
    prevAxis = currAxis;
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
