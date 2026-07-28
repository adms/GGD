/**
 * KillCombo — the number the owner asked to see:
 * 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」 (2026-07-27).
 *
 * Two pieces, deliberately:
 *   • `KillComboView` — PURE presentation. Props in, markup out, no store, no
 *     timers. That is what lets `killCombo.test.ts` render it with
 *     `renderToStaticMarkup` in the node env and assert that the number really
 *     reaches the DOM — the difference between "the model is right" and "the
 *     player can see it", which is this repo's most-repeated failure.
 *   • `KillCombo` — the container: the mount gate, the poll that retires the
 *     number, and the placement.
 *
 * THE GATE
 *   • combat only. Between rounds the shop owns the screen and a leftover
 *     combo would be a number floating over a shopping card.
 *   • not in couch (split-screen) play. The counter is ONE person's chain and
 *     there are up to four seats on that screen; four centred numbers stacked
 *     on each other is worse than none. CouchHudGrid is the place that would
 *     have to solve it, and it is out of scope here.
 *   • a placement must exist. `killComboRect` returns null when the corridor
 *     cannot hold the box without covering chrome (a landscape phone while the
 *     round-1 control legend is up) — and null means NOTHING IS DRAWN, not
 *     "draw it anyway at 0,0".
 *
 * Z-ORDER: `HUD_Z.slot`, i.e. above the touch-control layer and BELOW any
 * docked panel (the shop card paints at `HUD_Z.screen`). A defeated player is
 * shopping mid-combat with the last seconds of a combo still alive; the card
 * wins that pixel, which is the #107 precedence rule and not an accident.
 *
 * `pointer-events: none` on everything: a juice number that ate a click
 * mid-fight would be worse than the fight being un-legible.
 */
import React, { useEffect, useState } from "react";
import { comboNowMs, localDuelZone, useHud } from "../../net/RoomStore";
import {
  controlLegendVisible,
  readLegendDismissed,
} from "../controlLegendModel";
import { hudTouch } from "./HudSlot";
import { HUD_Z, type HudRect } from "./hudLayout";
import { useActiveHudPanels } from "./useHudPanels";
import { bossLifetime, bossVisibleInZone, mobBossOverlayRect } from "./mobBossModel";
import {
  KILL_COMBO_POLL_MS,
  killComboDisplay,
  killComboRect,
  killComboText,
  killComboNumberSize,
  type KillComboDisplay,
} from "./killComboModel";

/** Same shape as ControlLegend's: the HUD has no shared viewport hook. */
function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function KillComboView({
  rect,
  view,
}: {
  rect: HudRect;
  view: KillComboDisplay;
}): React.JSX.Element {
  // The number scales with the tier, but never past the box the layout proved
  // is free — bounded on BOTH axes. Height alone was the old rule and it let
  // 「50 連殺」 at the 天災 tier overflow the 260px corridor and wrap, dropping
  // 「殺」 onto its own line. See killComboNumberSize.
  const numberSize = killComboNumberSize(view.count, rect.w, rect.h, view.fontSize);
  const labelSize = Math.max(11, Math.round(numberSize * 0.3));
  return (
    <div
      data-kill-combo="root"
      data-kill-combo-tier={view.tier}
      data-kill-combo-phase={view.phase}
      // `key`-less on purpose: the animation restart rides `seq` through the
      // inline animation name, so React keeps the same element and the browser
      // still replays the pop.
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: HUD_Z.slot,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: view.opacity,
        // the exit: shrink as it fades, so the chain visibly ENDS
        transform: `scale(${view.phase === "out" ? 0.72 + 0.28 * view.opacity : 1})`,
        transformOrigin: "50% 50%",
        userSelect: "none",
      }}
      role="status"
      aria-live="off"
      aria-label={`${killComboText(view.count)} ${view.label}`}
    >
      <span
        data-kill-combo="tag"
        style={{
          fontSize: labelSize,
          fontWeight: 900,
          letterSpacing: "0.35em",
          textIndent: "0.35em",
          color: view.color,
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          opacity: 0.92,
        }}
      >
        {view.label}
      </span>
      <span
        data-kill-combo="count"
        style={{
          fontSize: numberSize,
          lineHeight: 1,
          // HARD guarantee. killComboNumberSize already shrinks to fit, but that
          // is an estimate; this makes wrapping impossible even if the estimate
          // is off by a few percent on some font stack. A hair of clipping is a
          // far better failure than 「殺」 alone on line two.
          whiteSpace: "nowrap",
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          color: view.color,
          textShadow: view.glow
            ? `0 0 ${Math.round(numberSize * 0.28)}px ${view.color}, 0 0 ${Math.round(numberSize * 0.6)}px ${view.color}88, 0 2px 4px rgba(0,0,0,0.95)`
            : "0 2px 4px rgba(0,0,0,0.95)",
          animation: `ggd-combo-pop-${view.seq % 2} 220ms cubic-bezier(.2,1.6,.4,1)${
            view.shake && view.phase === "live" ? ", ggd-combo-shake 320ms linear infinite" : ""
          }`,
        }}
      >
        {killComboText(view.count)}
      </span>
      {/* Scoped keyframes, carried by the component rather than a global sheet,
          so a stylesheet it does not own cannot break it. TWO pop names that
          alternate on `seq`: re-assigning the SAME animation name does not
          restart it, which is why 5→6 used to slide by with no beat.
          `prefers-reduced-motion` drops the movement and keeps the number. */}
      <style>{`
        @keyframes ggd-combo-pop-0 { from { transform: scale(1.55) } to { transform: scale(1) } }
        @keyframes ggd-combo-pop-1 { from { transform: scale(1.55) } to { transform: scale(1) } }
        @keyframes ggd-combo-shake {
          0%,100% { margin-left: 0 } 25% { margin-left: -3px } 75% { margin-left: 3px }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-kill-combo="count"] { animation: none !important }
        }
      `}</style>
    </div>
  );
}

export function KillCombo(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const combo = useHud((s) => s.killCombo);
  const boss = useHud((s) => s.mobBoss);
  const panels = useActiveHudPanels();
  const viewport = useViewport();

  // The counter has no per-frame stream to ride, so a cheap timer is what
  // retires it. Kept OUT of the pure model: the model answers "given this
  // instant", this only decides how often to ask.
  const [now, setNow] = useState(() => comboNowMs());
  useEffect(() => {
    const iv = setInterval(() => setNow(comboNowMs()), KILL_COMBO_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  if (phase !== "combat" || couch) return null;
  const view = killComboDisplay(combo, now);
  if (!view) return null;

  const legendUp = controlLegendVisible({
    phase,
    round,
    dismissed: readLegendDismissed(),
    panelCovering: panels.length > 0,
  });
  // The 殭屍王 overlay (#262 / GH #190) is TOP-anchored in this same corridor
  // and OUTRANKS the counter — resolved through `mobBossOverlayRect`, the same
  // one entry point the overlay itself draws from, so the two can never disagree
  // about where the king's box is. Null while no king moment is live, which is
  // almost always, and then this is a no-op.
  // …and only for a king in THIS arena. `bossVisibleInZone` is the same gate
  // the overlay itself applies, so the counter can never yield to a banner that
  // is not being painted (the other duel's king reaches this client too).
  const bossUp = bossLifetime(boss, now) && bossVisibleInZone(boss, localDuelZone());
  const bossRect = mobBossOverlayRect(bossUp ? boss : null, viewport, {
    touch: hudTouch(),
    legendUp,
    couchPlayers: 1,
  });
  const rect = killComboRect(viewport, { touch: hudTouch(), legendUp, couchPlayers: 1, bossRect });
  // null = this viewport genuinely has no free room. Showing nothing is the
  // correct answer; painting over the player's own bars is not.
  if (!rect) return null;

  return <KillComboView rect={rect} view={view} />;
}
