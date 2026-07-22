/**
 * HudSlot — the React side of hudLayout: the ONLY way in-match chrome claims
 * corner real estate. A component declares WHICH slot it is; the corner, the
 * order in the stack and the resulting offsets come from the registry.
 *
 * Two shapes, same source of truth:
 *   <HudSlot slot="team-lives"> … </HudSlot>   — wrapper div (most cases)
 *   style={{ ...hudSlotStyle("menu", hudTouch()) }}  — when the positioned
 *   element must BE the control itself (e.g. a single button).
 *
 * `data-hud-slot` is also the CSS hook ui/mobile.css uses to guarantee >=44px
 * tap targets on coarse pointers.
 */
import { isTouchDevice, readTouchEnv } from "../../input/mobileDetect";
import { HUD_Z, hudSlotStyle, type HudSlotId } from "./hudLayout";

/**
 * Coarse-pointer check for HUD sizing. Read at render time (same seam the
 * touch controls and the minimap use) — the HUD re-renders on every discrete
 * store change, and the pointer type does not change mid-match.
 */
export function hudTouch(): boolean {
  return isTouchDevice(readTouchEnv());
}

export function HudSlot({
  slot,
  z = HUD_Z.slot,
  interactive = false,
  style,
  children,
}: {
  slot: HudSlotId;
  /** override the paint order (HUD_Z.expanded while a slot's panel is open) */
  z?: number;
  /** the HUD layer is pointer-events:none; opt in to receive clicks */
  interactive?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-hud-slot={slot}
      style={{
        ...hudSlotStyle(slot, hudTouch(), z),
        pointerEvents: interactive ? "auto" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
