/**
 * useHudSurface — the RUNTIME half of the surface contract (#107 / #219).
 *
 * `hudSurfaces.ts` decides WHERE a surface may paint, purely, against a
 * viewport + a scene. This is the only glue to the live world: the window size,
 * the pointer type, the match phase and the panels `useHudPanels` says are
 * open. Both the guard and the running HUD resolve through the SAME pure
 * function, so a rectangle proven clear in `hudSurfaces.test.ts` is the
 * rectangle this hook returns.
 *
 * ⚠️ CORRECTED 2026-07-30. That last sentence used to end 「…is the rectangle the
 * browser paints — the ⑤「被測的不是出貨的那個」 failure shape is closed by
 * construction rather than by discipline」, and it was false in the only way that
 * matters: this hook's CALLERS are between it and the browser. Adding one line
 * to `SpectateNotice` —
 *   `const rect = resolved ? { ...resolved, y: SPECTATE_NOTICE_TOP } : null;`
 * — pinned the banner back onto the 「Round over」 pill (the owner's own report)
 * and left 140 files / 1906 tests green. ⑤ is closed by
 * `hudSurfacePaint.test.ts`'s shipped-mount table, which renders the components
 * HudRoot mounts and reads the coordinates back off the markup — i.e. by a
 * guard, not by construction.
 *
 * The sibling of `useHudPanels` (slots) — same shape, same reasoning.
 */
import { useEffect, useState } from "react";
import { useHud } from "../../net/RoomStore";
import { hudTouch } from "./HudSlot";
import { useActiveHudPanels } from "./useHudPanels";
import {
  asHudPhase,
  hudSurfaceRect,
  hudSurfaceStyle,
  type HudScene,
  type HudSurfaceId,
  type HudSurfaceStyle,
} from "./hudSurfaces";
import type { HudRect, HudViewport } from "./hudLayout";

/**
 * The layout viewport, re-read on resize / orientation change.
 *
 * The 1280×800 SSR fallback matters: this module is imported by components that
 * `progressChartRender`-style tests render through `react-dom/server`, where
 * there is no `window`. A desktop-shaped default keeps those renders
 * representative instead of collapsing every surface to `null`.
 */
export function useHudViewport(): HudViewport {
  const [size, setSize] = useState<HudViewport>(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return size;
}

/** The scene the HUD is really in right now (phase + open covering panels). */
export function useHudScene(): HudScene | null {
  const rawPhase = useHud((s) => s.phase);
  const panels = useActiveHudPanels();
  const phase = asHudPhase(rawPhase);
  return phase ? { phase, panels } : null;
}

/**
 * The rect a surface may paint in right now, or `null` when it is out of phase
 * or there is no honest room for it. A component that gets `null` renders
 * nothing — that is the contract, not a failure.
 */
export function useHudSurface(id: HudSurfaceId): HudRect | null {
  const vp = useHudViewport();
  const scene = useHudScene();
  const touch = hudTouch();
  return scene ? hudSurfaceRect(id, vp, touch, scene) : null;
}

/** `useHudSurface` plus the absolute-position style to spread. */
export function useHudSurfaceStyle(id: HudSurfaceId): HudSurfaceStyle | null {
  const rect = useHudSurface(id);
  return rect ? hudSurfaceStyle(id, rect) : null;
}
