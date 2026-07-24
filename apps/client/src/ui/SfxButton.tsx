/**
 * SfxButton — a drop-in <button> that gives EVERY raw button (the ones that
 * don't route through the shared platform Btn) the same feedback:
 *   • hover  → "uiHover"      (buttonSfx)
 *   • click  → unlock + "uiClick" → the caller's onClick
 *   • a press-scale on pointer-down and a subtle click ripple, both skipped
 *     under prefers-reduced-motion (the sound still plays).
 *
 * It forwards all the usual button props (className, title, style, disabled,
 * aria-*, key, …) so it swaps in for a `<button>` with no other changes. A
 * disabled button gets no handlers (no sound, no ripple, no scale). Pass
 * `sfxVolume` for a quieter voice next to louder audio (e.g. in-match HUD), and
 * `pressScale={1}` for a button that uses `transform` for layout (so the scale
 * never clobbers its positioning).
 */
import { buttonSfx, prefersReducedMotion, spawnClickRipple } from "./buttonSfx";

/** JRPG + cyber-glow skin variant (maps to a buttonFx.css `.ggd-btn--*` class). */
export type SfxButtonKind = "primary" | "danger" | "ghost" | "subdued" | "card";

export interface SfxButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** attenuate the hover+click voices (0..1); omitted = authored gain. */
  sfxVolume?: number;
  /** press-scale factor on pointer-down (default 0.95); 1 disables the scale. */
  pressScale?: number;
  /** skin variant — adds the shared `.ggd-btn--<kind>` class (buttonFx.css). */
  kind?: SfxButtonKind;
  /**
   * Override the CLICK voice (default "uiClick"). A shared tab / segmented
   * primitive passes "uiTabSwitch"; an on/off switch passes "uiToggle". Replaces
   * the generic click blip (not layered), so the specialised cue reads cleanly.
   */
  clickSfx?: string;
}

export function SfxButton({
  sfxVolume,
  pressScale = 0.95,
  kind,
  clickSfx,
  className,
  disabled,
  style,
  children,
  onClick,
  onPointerEnter,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  ...rest
}: SfxButtonProps): React.JSX.Element {
  const sfx = disabled
    ? undefined
    : buttonSfx(undefined, {
        ...(sfxVolume !== undefined ? { volume: sfxVolume } : {}),
        ...(clickSfx !== undefined ? { clickSfx } : {}),
      });

  // shared JRPG + cyber-glow skin (buttonFx.css) — skin only; the caller's
  // inline `style` still owns geometry (padding/size/radius).
  const cls = ["ggd-btn", kind ? `ggd-btn--${kind}` : "", className].filter(Boolean).join(" ");

  return (
    <button
      {...rest}
      className={cls}
      disabled={disabled}
      style={{ position: "relative", overflow: "hidden", transition: "transform 80ms ease", ...style }}
      onPointerEnter={(e) => {
        sfx?.onPointerEnter();
        onPointerEnter?.(e);
      }}
      onClick={(e) => {
        if (disabled) return;
        sfx?.onClick(); // unlock + uiClick
        if (!prefersReducedMotion()) spawnClickRipple(e.currentTarget, e.clientX, e.clientY);
        onClick?.(e);
      }}
      onPointerDown={(e) => {
        // Only ever touch transform when a press-scale is active — pressScale={1}
        // leaves it untouched so buttons that use transform for layout (e.g. a
        // translateX(-50%) centered badge) keep their positioning.
        if (!disabled && pressScale !== 1 && !prefersReducedMotion()) {
          e.currentTarget.style.transform = `scale(${pressScale})`;
        }
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        if (pressScale !== 1) e.currentTarget.style.transform = "";
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        if (pressScale !== 1) e.currentTarget.style.transform = "";
        onPointerLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}
