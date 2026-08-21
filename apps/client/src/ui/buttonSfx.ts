/**
 * buttonSfx — shared hover + click sound handlers for any button in the client.
 * Spread the returned props onto a <button>, or reuse inside the shared Btn, so
 * EVERY screen (login / lobby / shop / draft / settings / ranked / HUD) gets the
 * same audio feedback without wiring each button.
 *
 *   hover  → "uiHoverCyber"  (the long Akira-style ring-out; the plain
 *                              "uiHover" tick stays for NON-button elements —
 *                              user: 賽博風格的按鈕用殘響音, 其他欄位元件用之前的)
 *   click  → unlock the AudioContext (a click is a user gesture) → "uiClick" →
 *            run the original handler.
 *
 * `playSfx` no-ops until the context is unlocked and respects the SFX mute, so
 * these handlers are always safe to attach. Disabled buttons get no handlers.
 *
 * Also exports the small VISUAL cue shared by every button — a click ripple +
 * the press-scale — used by the <SfxButton> wrapper (SfxButton.tsx). Both the
 * ripple and the scale respect prefers-reduced-motion (skipped there; the sound
 * still plays). Everything here is DOM-guarded so it runs in a non-DOM (node /
 * SSR) test env too.
 */
import { audioSystem } from "../audio";

export interface ButtonSfxProps {
  onPointerEnter: () => void;
  onClick: () => void;
}

export interface ButtonSfxOptions {
  /**
   * Multiplies the authored per-clip SFX gain (0..1) for BOTH the hover and the
   * click voice — a quiet button that sits near louder audio (e.g. an in-match
   * HUD control next to combat SFX). Omitted = the authored gain, unchanged.
   */
  volume?: number;
  /**
   * Override the CLICK voice (default "uiClick"). Lets a SHARED primitive route
   * its own distinct cue through this one handler instead of the generic click
   * blip: a tab / segmented-control plays "uiTabSwitch", an on/off switch plays
   * "uiToggle". Replaces uiClick (not layered on top), so the specialised cue is
   * heard cleanly. Hover is unchanged. no-ops under the SFX mute / test-mode
   * silence like every other playSfx call.
   */
  clickSfx?: string;
}

/** Handlers for an ENABLED button. Wraps the caller's onClick with the click sfx. */
export function buttonSfx(onClick?: () => void, opts?: ButtonSfxOptions): ButtonSfxProps {
  const play = (event: string): void => {
    if (opts?.volume !== undefined) audioSystem.playSfx(event, { volume: opts.volume });
    else audioSystem.playSfx(event);
  };
  return {
    onPointerEnter: () => {
      play("uiHoverCyber");
    },
    onClick: () => {
      audioSystem.unlock(); // first user gesture unlocks autoplay
      play(opts?.clickSfx ?? "uiClick");
      onClick?.();
    },
  };
}

/**
 * The event fields {@link buttonPressFx} reads. Structural on purpose: it keeps
 * this module React-free while still being assignable to React's pointer
 * handlers (a `React.PointerEvent<HTMLButtonElement>` has all three).
 */
export interface PressFxEvent {
  currentTarget: HTMLElement;
  clientX: number;
  clientY: number;
}

/** Press-scale + ripple handlers, ready to spread onto any `<button>`. */
export interface ButtonPressFxProps {
  onPointerDown: (e: PressFxEvent) => void;
  onPointerUp: (e: PressFxEvent) => void;
  onPointerLeave: (e: PressFxEvent) => void;
}

/**
 * The VISUAL half of a button press — the press-scale and the click ripple —
 * WITHOUT the `.ggd-btn` skin (GH#113).
 *
 * `<SfxButton>` bundles the two together, but its class list ALWAYS carries
 * `ggd-btn`, whose buttonFx.css skin notches the corners and animates a
 * gradient bloom. A button that already owns its look — the global audio
 * cluster's 32px icon squares, which sit over the login artwork and the arena —
 * needs the feedback and NOT that restyle, and re-skinning the most global
 * control in the game is a look decision nobody asked for. So the cue is
 * offered on its own here instead of being copy-pasted into that component.
 *
 * Both halves respect prefers-reduced-motion (checked per call, so a mid-session
 * OS change is picked up) and both are DOM-guarded, so this is safe to spread in
 * a non-DOM test env.
 */
export function buttonPressFx(scale = 0.92): ButtonPressFxProps {
  const reduced = prefersReducedMotion();
  const release = (e: PressFxEvent): void => {
    if (e.currentTarget?.style) e.currentTarget.style.transform = "";
  };
  return {
    onPointerDown: (e) => {
      if (reduced || !e.currentTarget?.style) return;
      e.currentTarget.style.transform = `scale(${scale})`;
      spawnClickRipple(e.currentTarget, e.clientX, e.clientY, { reduced });
    },
    onPointerUp: release,
    onPointerLeave: release,
  };
}

/**
 * True when the OS/browser asks for reduced motion. Safe in a non-DOM env
 * (no window / matchMedia → false, i.e. motion allowed by default in tests).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Whether a click should paint the ripple cue (skipped under reduced-motion). */
export function rippleEnabled(reduced: boolean = prefersReducedMotion()): boolean {
  return !reduced;
}

/**
 * Paint a subtle click ripple inside `host`. Cheap + self-cleaning: one absolutely
 * positioned <span> that animates (CSS `.ggd-ripple`) and removes itself. A no-op
 * (returns false) under reduced-motion or when there is no DOM. `opts.doc`/`reduced`
 * are injectable for tests; both default to the live environment.
 */
export function spawnClickRipple(
  host: HTMLElement,
  clientX: number,
  clientY: number,
  opts: { reduced?: boolean; doc?: Document } = {},
): boolean {
  const reduced = opts.reduced ?? prefersReducedMotion();
  if (reduced) return false;
  const doc = opts.doc ?? (typeof document !== "undefined" ? document : null);
  if (!doc) return false;

  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) || 24;
  const ripple = doc.createElement("span");
  ripple.className = "ggd-ripple";
  const s = ripple.style;
  s.position = "absolute";
  s.width = `${size}px`;
  s.height = `${size}px`;
  s.left = `${clientX - rect.left - size / 2}px`;
  s.top = `${clientY - rect.top - size / 2}px`;
  s.borderRadius = "50%";
  s.pointerEvents = "none";
  s.background = "rgba(255, 255, 255, 0.35)";
  host.appendChild(ripple);

  const cleanup = (): void => ripple.remove();
  ripple.addEventListener("animationend", cleanup);
  // fallback: drop the node even if animationend never fires (e.g. unmounted)
  setTimeout(cleanup, 650);
  return true;
}
