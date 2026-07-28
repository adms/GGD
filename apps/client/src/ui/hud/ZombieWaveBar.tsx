/**
 * ZombieWaveBar — the 殭屍來襲 banner and the live 已擊殺 tally (task #258).
 *
 * The decision lives in `./zombieWaveModel`; this file only paints it and owns
 * the two things that cannot be pure: the store subscription and the surge-edge
 * stamp (「上一次空地上冒出殭屍是什麼時候」), which is a clock reading.
 *
 * PLACEMENT (#107, and it is DERIVED, not chosen). This is centred-free
 * chrome that owns no corner slot — like `SelfStatusBar` and `KillCombo`, and
 * for the same reason (`HUD_SLOTS` is a four-corner registry and adding a real
 * slot to the bottom-left stack would break `hudLayout.test.ts`'s
 * `hudStackEnd("bottom-left") === hudSlotBand("fps").end` contract). So it
 * docks one gap past the WHOLE bottom-left stack:
 *
 *     bottom = hudStackEnd("bottom-left", touch, { skipTransient: true }) + HUD_GAP
 *
 * which is exactly the arithmetic `hudDisplacedOffset` uses for a relocated
 * slot. Three consequences, all deliberate:
 *   • it can never sit on the gamepad chip or the FPS pill, because it starts
 *     where they end — if either changes height this moves with them;
 *   • it clears the build-stamp / ping band by construction: `hudStackEnd`
 *     starts at `HUD_EDGE`, and `HUD_STAMP_BAND === HUD_EDGE` (asserted in
 *     versionBadgeBand.test.ts), so the offset is always >= the band;
 *   • `skipTransient` skips the settings-gated perf panel, per hudLayout's own
 *     rule that an opt-in dev overlay never shrinks the real UI.
 * The one thing above it in this flank is `SelfStatusBar` at
 * `HUD_STAMP_BAND + 122`; `zombieWave.test.ts` proves the two do not meet.
 */
import React, { useEffect, useRef, useState } from "react";
import { useHud } from "../../net/RoomStore";
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_SLOTS,
  HUD_STAMP_BAND,
  HUD_Z,
  hudSlotCorner,
  hudSlotWidth,
  hudStackEnd,
  type HudSlotId,
} from "./hudLayout";
import { hudTouch } from "./HudSlot";
import {
  zombieSurgeAt,
  zombieWaveView,
  type ZombieWaveView,
} from "./zombieWaveModel";

/**
 * How often the bar re-checks whether the alert window has lapsed. The counts
 * themselves arrive through the store (snapshot rate); this timer exists only
 * to retire the loud treatment, so 150 ms is far more than enough and costs
 * nothing.
 */
export const ZOMBIE_POLL_MS = 150;

/** Distance from the bottom edge, DERIVED from the corner registry (see above). */
export function zombieBarBottom(touch: boolean): number {
  return hudStackEnd("bottom-left", touch, { skipTransient: true }) + HUD_GAP;
}

/** Comfortable width for 「殭屍來襲！ 殭屍 ×30 已擊殺 999」 at these font sizes. */
export const ZOMBIE_BAR_MAX_W = 260;

/**
 * How much of the viewport's width the RIGHT-hand stack owns — the widest slot
 * in the bottom-right corner, plus both edge insets and a gap.
 *
 * WHY THIS EXISTS AT ALL. The bar is bottom-LEFT, so on a desktop-width screen
 * it never comes near the minimap. On a 375-wide viewport it does: the minimap
 * reserves 208px and is right-anchored, so its left edge sits at x = 157 while
 * a 260px bar would run to x = 270. Left-anchored chrome and right-anchored
 * chrome only miss each other when the viewport is wide enough for both, and
 * this is the arithmetic that says when it is not.
 */
export function zombieBarRightReserve(touch: boolean): number {
  let widest = 0;
  for (const spec of HUD_SLOTS) {
    const id = spec.id as HudSlotId;
    if (hudSlotCorner(id, touch) !== "bottom-right") continue;
    widest = Math.max(widest, hudSlotWidth(id, touch));
  }
  return HUD_EDGE + widest + HUD_EDGE + HUD_GAP;
}

/**
 * The bar's width cap for a concrete viewport: whichever is smaller, its
 * comfortable width or the room actually left beside the right-hand stack.
 * Clipping a long line is a small loss; painting over the minimap is not.
 */
export function zombieBarMaxWidth(viewportWidth: number, touch: boolean): number {
  return Math.max(0, Math.min(ZOMBIE_BAR_MAX_W, viewportWidth - zombieBarRightReserve(touch)));
}

/** The same cap as CSS, so the browser re-evaluates it on every resize. */
export function zombieBarMaxWidthCss(touch: boolean): string {
  return `min(${ZOMBIE_BAR_MAX_W}px, calc(100vw - ${zombieBarRightReserve(touch)}px))`;
}

export function ZombieWaveBarView({
  view,
  touch,
}: {
  view: ZombieWaveView | null;
  touch: boolean;
}): React.JSX.Element | null {
  if (!view) return null;
  const hot = view.alerting;
  return (
    <div
      data-zombie-wave={hot ? "alert" : "tally"}
      style={{
        position: "fixed",
        left: "calc(env(safe-area-inset-left, 0px) + 10px)",
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${zombieBarBottom(touch)}px)`,
        zIndex: HUD_Z.slot,
        // never eats a click: this is a readout, and the flank it sits on is
        // also where a phone player's thumb lands
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: hot ? "5px 12px" : "3px 10px",
        borderRadius: 6,
        border: `1px solid ${hot ? "#8fd94a" : "rgba(143,217,74,0.45)"}`,
        background: hot ? "rgba(30,52,16,0.92)" : "rgba(12,16,12,0.82)",
        boxShadow: hot ? "0 0 16px rgba(143,217,74,0.45)" : "0 2px 8px rgba(0,0,0,0.55)",
        whiteSpace: "nowrap",
        // never reach into the right-hand stack's column (see zombieBarMaxWidth):
        // on a 375-wide viewport the minimap's left edge is at x=157, and a
        // full-width bar would paint over it.
        maxWidth: zombieBarMaxWidthCss(touch),
        overflow: "hidden",
      }}
      role="status"
      aria-live="polite"
    >
      {hot && (
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#d6ff9c",
            letterSpacing: "1px",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          }}
        >
          {view.alertText}
        </span>
      )}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: view.alive > 0 ? "#b8e986" : "#7c8f6d",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {view.aliveText}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#f0d78a",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {view.killsText}
      </span>
    </div>
  );
}

export function ZombieWaveBar(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const alive = useHud((s) => s.mobsAlive);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const kills =
    localSeatId === null ? 0 : (seats.find((x) => x.seatId === localSeatId)?.mobKills ?? 0);

  // The surge edge and the alert clock. A ref for the previous count so the
  // stamp is decided by `zombieSurgeAt` (pure, tested) rather than by an effect
  // that re-runs on every unrelated render.
  const prevAlive = useRef(0);
  const [surgeAtMs, setSurgeAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    const next = zombieSurgeAt(prevAlive.current, alive, surgeAtMs, performance.now());
    prevAlive.current = alive;
    if (next !== surgeAtMs) setSurgeAtMs(next);
    // `surgeAtMs` is deliberately NOT a dependency: including it would re-run
    // this on the very state change it just made and re-stamp the edge forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive]);
  useEffect(() => {
    const iv = setInterval(() => setNowMs(performance.now()), ZOMBIE_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  const touch = hudTouch();
  return (
    <ZombieWaveBarView view={zombieWaveView({ phase, alive, kills, surgeAtMs, nowMs })} touch={touch} />
  );
}

/** Re-exported so the guard can assert the derivation without a second import. */
export { HUD_STAMP_BAND };
