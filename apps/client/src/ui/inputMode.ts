/**
 * inputMode — WHICH input device the player is actually using right now.
 *
 * WHY THIS EXISTS
 * ---------------
 * The client already knows how to READ every input tree (mouse/keyboard,
 * gamepad, touch) but it has never had to know which one a human is HOLDING.
 * Nothing needed it: every path feeds the same IntentSender and the last writer
 * wins, deliberately. The control legend (#187) is the first consumer that
 * cannot be device-agnostic — showing a pad player 「Q W E R」 is worse than
 * showing nothing, because it is a confident wrong answer.
 *
 * WHAT COUNTS AS EVIDENCE — only things a human physically did:
 *   • a key press / mouse press / wheel        → keyboard  (keyboard + mouse)
 *   • a touch, or a pointer event of type touch → touch
 *   • a gamepad button or a deflected stick     → gamepad
 *   • `gamepadconnected`                        → gamepad
 *
 * `gamepadconnected` is real evidence and not merely "a pad is plugged in":
 * browsers withhold the event (and the pad from `getGamepads()`) until the pad
 * produces input, precisely so a page cannot fingerprint idle hardware. The
 * poll below is the belt to that braces — it also catches a pad that was
 * already live when this attached, and a second player picking up a pad
 * mid-round, which is exactly the couch case.
 *
 * DELIBERATELY NOT A ZUSTAND SLICE. `net/RoomStore` is the projection of
 * SERVER state; this is a local device fact with no seat, no match and no
 * wire representation, and the architecture gate (client-08) keeps zustand for
 * the store. It is the same plain pub/sub shape `settings/SettingsStore` uses,
 * read into React through `useSyncExternalStore`.
 *
 * NOT PERSISTED, on purpose: the answer is "what is in your hands", and that is
 * a fact about the next 200ms, not about the installation.
 */
import { useSyncExternalStore } from "react";
import { GAMEPAD_DEADZONE, listPadSources, type PadState } from "../input/GamepadInput";
import { isTouchDevice, readTouchEnv } from "../input/mobileDetect";

export type InputMode = "keyboard" | "gamepad" | "touch";

/** How each mode names itself in the UI (繁中). */
export const INPUT_MODE_LABEL: Record<InputMode, string> = {
  keyboard: "鍵盤 / 滑鼠",
  gamepad: "手把",
  touch: "觸控",
};

/**
 * PURE: the mode a DOM event proves, or null when it proves nothing.
 *
 * `pointerType` matters: a `pointerdown` is the SAME event for a mouse and a
 * finger, and treating a finger as a mouse would flip a phone player onto the
 * keyboard legend on their first tap.
 */
export function inputModeForEvent(type: string, pointerType?: string): InputMode | null {
  if (type === "touchstart") return "touch";
  if (type === "gamepadconnected") return "gamepad";
  if (type === "pointerdown" || type === "pointermove") {
    if (pointerType === "touch" || pointerType === "pen") return "touch";
    return pointerType === "mouse" || pointerType === undefined ? "keyboard" : null;
  }
  if (type === "keydown" || type === "mousedown" || type === "wheel") return "keyboard";
  return null;
}

/**
 * PURE: is ANY connected pad being touched right now? Uses the same radial
 * deadzone as the real mapping so a resting stick's drift never counts.
 */
export function padActivity(
  pads: readonly (PadState | null)[],
  deadzone = GAMEPAD_DEADZONE,
): boolean {
  for (const pad of pads) {
    if (!pad?.connected) continue;
    for (const b of pad.buttons) {
      if (b?.pressed) return true;
    }
    for (let i = 0; i + 1 < pad.axes.length; i += 2) {
      const ax = pad.axes[i] ?? 0;
      const ay = pad.axes[i + 1] ?? 0;
      if (Math.sqrt(ax * ax + ay * ay) >= deadzone) return true;
    }
  }
  return false;
}

/** The mode to start in, before the player has touched anything. */
export function initialInputMode(touch = isTouchDevice(readTouchEnv())): InputMode {
  return touch ? "touch" : "keyboard";
}

class InputModeStore {
  private mode: InputMode = initialInputMode();
  private readonly listeners = new Set<() => void>();

  get(): InputMode {
    return this.mode;
  }

  /** Record evidence. Same mode = no notification, so React never re-renders. */
  set(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const cb of this.listeners) cb();
  }

  /** Test seam: back to the device default. */
  reset(mode: InputMode = initialInputMode()): void {
    this.mode = mode;
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export const inputModeStore = new InputModeStore();

/** How often the pad poll looks for a button/stick that no DOM event reports. */
export const PAD_POLL_MS = 250;

/**
 * Start listening. Returns the detach function. Safe to call outside a browser
 * (returns a no-op), so the node test env and SSR are unaffected.
 *
 * Listeners are CAPTURING and passive: the legend must observe the input the
 * game is receiving without ever standing in its way.
 */
export function attachInputModeDetection(
  listPads: () => (PadState | null)[] = listPadSources,
): () => void {
  if (typeof window === "undefined") return () => {};
  const disposers: (() => void)[] = [];
  const on = (type: string): void => {
    const fn = (ev: Event): void => {
      const pointerType = (ev as PointerEvent).pointerType;
      const mode = inputModeForEvent(type, pointerType);
      if (mode) inputModeStore.set(mode);
    };
    window.addEventListener(type, fn, { capture: true, passive: true });
    disposers.push(() => window.removeEventListener(type, fn, { capture: true }));
  };
  for (const type of ["keydown", "pointerdown", "wheel", "touchstart", "gamepadconnected"]) on(type);

  const timer = window.setInterval(() => {
    if (padActivity(listPads())) inputModeStore.set("gamepad");
  }, PAD_POLL_MS);
  disposers.push(() => window.clearInterval(timer));

  return () => {
    for (const d of disposers) d();
    disposers.length = 0;
  };
}

/** React binding. Re-renders only when the mode actually changes. */
export function useInputMode(): InputMode {
  return useSyncExternalStore(
    (cb) => inputModeStore.subscribe(cb),
    () => inputModeStore.get(),
    () => inputModeStore.get(),
  );
}
