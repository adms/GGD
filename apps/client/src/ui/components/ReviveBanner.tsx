/**
 * ReviveBanner — the HUD half of the revive circles (task #84).
 *
 * WHO IT IS FOR, in priority order:
 *   1. THE DEAD PLAYER. They are spectating and have no other way to know that
 *      a circle was dropped for them, that it is still burning, or that a
 *      teammate is standing in it. Without this panel the whole mechanic is
 *      invisible to the one person it is about. They get the loudest copy
 *      ("隊友正在復活你").
 *   2. THE CHANNELLER. They are rooted in melee range of the team that just
 *      scored a kill; the world ring already shows the fill under their feet,
 *      and this repeats it as a numeric progress bar so the commitment is
 *      unambiguous.
 *   3. Everyone else on the team, as an "a rescue is possible, go help" cue.
 *
 * THERE IS NO COUNTDOWN. This panel used to end in a "6.0s → 0.0s" readout
 * that turned red under 1.5s. Task #196 gave the ring an unlimited lifetime
 * (「復活隊友的圈圈 沒有消失期限直到回合結束」, matching LoL Arena's untimed
 * downed zone), so the only honest answer to "how long do I have?" is "until
 * the round ends" — and a clock that never moved would read as broken.
 *
 * RATE DISCIPLINE (client-08): progress changes every sim tick, so it NEVER
 * goes through React or the Zustand store. The component
 * subscribes to the discrete store only for identity (am I on this team? am I
 * alive?) and drives the numbers from `frameBus.reviveCircles` inside its own
 * rAF, patching DOM styles imperatively — the same contract WorldAnchorLayer
 * and the minimap already use.
 *
 * POSITION: claimed through the task #42 corner registry (`revive` slot,
 * ui/hud/hudLayout). No corner coordinate is written here.
 */
import { useEffect, useRef } from "react";
import { useHud } from "../../net/RoomStore";
import { frameBus, type ReviveCircleMarker } from "../../frameBus";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotHeight, hudSlotStyle } from "../hud/hudLayout";
import { useHudSlotHidden } from "../hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

/** UI redraw cadence — the snapshot rate, not the render rate. */
const REDRAW_MS = 50;

/** Hot warning colour while an enemy contests the ring (mirrors the world VFX). */
export const CONTEST_CSS = "#ff9e29";

/**
 * The circle this HUD should show, given every live circle and who the local
 * player is. Pure, so the selection rule is testable without a DOM:
 *   • only the LOCAL player's team ever appears (an enemy's circle is not the
 *     player's business, and showing it would leak information),
 *   • the player's OWN circle wins over a teammate's — that is the one whose
 *     countdown decides whether they get to play again,
 *   • otherwise the first (there is at most one per team anyway).
 */
export function pickReviveCircle(
  circles: readonly ReviveCircleMarker[],
  localTeamId: number | null,
  localSeatId: number | null,
): ReviveCircleMarker | null {
  if (localTeamId === null) return null;
  let fallback: ReviveCircleMarker | null = null;
  for (const c of circles) {
    if (c.teamId !== localTeamId) continue;
    if (localSeatId !== null && c.ownerSeatId === localSeatId) return c;
    if (!fallback) fallback = c;
  }
  return fallback;
}

/** The headline for one circle, from the viewer's point of view. */
export function reviveHeadline(c: ReviveCircleMarker, isOwn: boolean): string {
  if (c.contested) return isOwn ? "敵人壓住你的復活圈！" : "復活圈被敵人壓住！";
  if (c.channelling) return isOwn ? "隊友正在復活你…" : "正在復活隊友…";
  return isOwn ? "快叫隊友來踩復活圈！" : "隊友倒下了 — 去踩復活圈";
}

export function ReviveBanner(): React.JSX.Element | null {
  const localSeatId = useHud((s) => s.localSeatId);
  const localTeamId = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? null;
  });
  const phase = useHud((s) => s.phase);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);

  const touch = hudTouch();
  // A defeated player's left-docked shop owns the top-left corner this banner
  // lives in, so the banner hides while that shop surface is mounted (task
  // #107). The world revive ring + the minimap ring still show the rescue.
  const covered = useHudSlotHidden("revive", touch);
  const visible = phase === "combat" && !covered;

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = 0;
    let shownHead = "";
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      if (now - last < REDRAW_MS) return;
      last = now;
      const root = rootRef.current;
      if (!root) return;
      const c = pickReviveCircle(frameBus.reviveCircles, localTeamId, localSeatId);
      if (!c) {
        // no circle for my team: the panel vanishes entirely rather than
        // sitting there empty — "no circle = no second chance", legibly.
        root.style.display = "none";
        return;
      }
      root.style.display = "block";
      const isOwn = localSeatId !== null && c.ownerSeatId === localSeatId;
      const accent = c.contested ? CONTEST_CSS : teamCss(c.teamId);
      root.style.borderColor = accent;

      const head = reviveHeadline(c, isOwn);
      if (head !== shownHead && headRef.current) {
        headRef.current.textContent = head;
        shownHead = head;
      }
      if (headRef.current) headRef.current.style.color = accent;
      if (fillRef.current) {
        fillRef.current.style.width = `${Math.round(c.progress * 100)}%`;
        fillRef.current.style.background = accent;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible, localTeamId, localSeatId]);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      data-hud-slot="revive"
      style={{
        ...hudSlotStyle("revive", touch),
        display: "none", // the rAF turns it on the moment a circle exists
        boxSizing: "border-box",
        width: touch ? 190 : 250,
        minHeight: hudSlotHeight("revive", touch),
        padding: touch ? "5px 8px" : "7px 11px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderLeft: "3px solid transparent",
        borderRadius: 8,
      }}
    >
      <div
        ref={headRef}
        style={{ fontSize: touch ? 10 : 12, fontWeight: "bold", color: TEXT_MAIN }}
      />
      <div
        style={{
          marginTop: 5,
          height: touch ? 5 : 7,
          borderRadius: 4,
          background: "rgba(255,255,255,0.13)",
          overflow: "hidden",
        }}
      >
        <div ref={fillRef} style={{ width: "0%", height: "100%", borderRadius: 4 }} />
      </div>
    </div>
  );
}
