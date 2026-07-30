/**
 * BottomCluster — the ONE box that owns 「HP&MP 條跟技能格子緊鄰但不重疊」.
 *
 * It is deliberately a real DOM container with a real `gap`, not two boxes that
 * each compute a `bottom` from the same numbers. The difference matters: a
 * shared arithmetic helper still lets a component add `marginTop: 20` (or grow
 * a row by 4 px) and drift apart silently, whereas a flex column CANNOT — the
 * distance between the two rows is the container's `gap` and nothing else.
 *
 * ⚠️ WHY THE OVERLAYS ARE NOT IN HERE. `AbilityBar` used to return a fragment
 * of three things: the bar, `AbilityDescriptionOverlay` (position:fixed, top:10)
 * and `CastNoticeLine` (position:absolute, bottom:104). Both of those are
 * positioned boxes, and this container is a positioned ancestor — an
 * `position:absolute` child would resolve `bottom` against THIS box instead of
 * the HUD layer, and even the `fixed` one would be captured, because an
 * ancestor with a `transform` becomes the containing block for fixed
 * descendants. So the two overlays are mounted by HudRoot as SIBLINGS of this
 * container, and this container is positioned with a computed `left` rather
 * than `left:50% + translateX(-50%)` — no transform, no surprises.
 *
 * The geometry (and the reasoning, and the fields) lives in ./hudBottomCluster;
 * this file is only the mount.
 */
import type { CSSProperties } from "react";
import { HUD_Z } from "./hudLayout";
import { hudClusterRects, hudClusterTuning, type HudClusterRows } from "./hudBottomCluster";
import { useHudViewport } from "./useHudSurface";
import { hudTouch } from "./HudSlot";

export interface BottomClusterProps {
  /** the HP/MP plate — pass null when it must not paint */
  resources: React.ReactNode;
  /** the desktop ability bar — null on coarse pointers (TouchControls owns it) */
  abilities: React.ReactNode;
}

/**
 * The container's style, derived from the SAME resolver the guard asserts on.
 * Exported so `hudBottomCluster.test.ts` can compare the painted declarations
 * against the resolved rect without re-deriving either.
 */
export function bottomClusterStyle(
  vpWidth: number,
  vpHeight: number,
  touch: boolean,
  rows: HudClusterRows,
): CSSProperties {
  const tuning = hudClusterTuning();
  const { cluster } = hudClusterRects({ width: vpWidth, height: vpHeight }, touch, rows, tuning);
  return {
    position: "absolute",
    left: cluster.x,
    // `bottom` rather than `top`, so a mid-frame viewport-height change cannot
    // detach the column from the edge it is anchored to.
    bottom: touch ? tuning.clusterTouchBottomPx : tuning.clusterBottomPx,
    width: cluster.w,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: rows.resources && rows.abilities ? tuning.barsToAbilitiesGapPx : 0,
    // the container itself must never eat clicks meant for the arena; the bar
    // inside it re-enables pointer events for its own tiles.
    pointerEvents: "none",
    zIndex: HUD_Z.slot,
  };
}

export function BottomCluster(props: BottomClusterProps): React.JSX.Element | null {
  const vp = useHudViewport();
  const touch = hudTouch();
  const rows: HudClusterRows = {
    resources: props.resources !== null && props.resources !== false,
    abilities: props.abilities !== null && props.abilities !== false,
  };
  if (!rows.resources && !rows.abilities) return null;
  return (
    <div
      data-hud-cluster="bottom"
      style={bottomClusterStyle(vp.width, vp.height, touch, rows)}
    >
      {props.resources}
      {props.abilities}
    </div>
  );
}
