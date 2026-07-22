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
      play("uiClick");
      onClick?.();
    },
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
