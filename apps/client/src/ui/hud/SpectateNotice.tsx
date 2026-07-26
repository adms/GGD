/**
 * SpectateNotice — say so, loudly, when the camera is no longer showing YOUR
 * fight (owner, 2026-07-27: 「畫面跳到別的隊伍場地的時候要有明顯提示
 * 『等待並觀戰別的競技場晉級戰鬥中』」).
 *
 * The jump itself is deliberate and already correct (#208): the moment your own
 * duel is decided, the combat camera is redirected to a still-live zone so you
 * are not left staring at an empty floor, and the minimap follows it
 * (hud/Minimap.localZoneIndex reads the same `frameBus.spectateZone`). What was
 * missing is the SENTENCE. From the player's side the screen simply cut to
 * strangers fighting in a place they had never been, with their own champion
 * nowhere on it — indistinguishable from a bug, and the natural reaction is to
 * mash movement keys at champions that are not yours.
 *
 * SOURCE OF TRUTH is `frameBus.spectateZone`, the very field the camera
 * redirect writes (GameApp.updateSpectateZone). Deriving this from anything
 * else — the local seat's alive flag, the team's elimination state, a phase —
 * would be a second opinion about where the camera is, and the two would drift.
 * Non-null means "redirected"; null means "watching your own zone", including
 * every case where you are simply dead in your own still-live duel, where the
 * #85 death wash already tells the story and this banner would be noise.
 *
 * rAF-polled rather than store-subscribed for the same reason Minimap is:
 * `frameBus` is written every render frame by the render loop and never goes
 * through React. Reading it on a timer keeps this component out of the sim→UI
 * projection entirely, so it cannot make the HUD re-render at 60 Hz.
 */
import React, { useEffect, useState } from "react";
import { frameBus } from "../../frameBus";
import { HUD_Z } from "./hudLayout";

/**
 * How often the banner re-checks the camera's zone. 200 ms is far below the
 * threshold at which a player perceives lag on an informational banner, and far
 * above the render cadence — so the check costs nothing while still appearing
 * within a fifth of a second of the cut.
 */
export const SPECTATE_POLL_MS = 200;

/** The line the owner asked for, verbatim. Exported so the test cannot drift from it. */
export const SPECTATE_NOTICE_TEXT = "等待並觀戰別的競技場晉級戰鬥中";

/**
 * The pure decision: given the camera's redirected zone, is the notice shown
 * and what does it say? Split out so the wording and the gate are testable
 * without a DOM, a render loop or a WebGL context.
 */
export function spectateNotice(spectateZone: number | null): { show: boolean; text: string; zoneLabel: string } {
  if (spectateZone === null) return { show: false, text: "", zoneLabel: "" };
  // 1-based for humans: the player has never seen a zero-indexed zone anywhere
  // else in this game, and 「第 0 競技場」 reads as a bug.
  return {
    show: true,
    text: SPECTATE_NOTICE_TEXT,
    zoneLabel: `第 ${spectateZone + 1} 競技場`,
  };
}

export function SpectateNotice(): React.JSX.Element | null {
  const [zone, setZone] = useState<number | null>(frameBus.spectateZone);
  useEffect(() => {
    const iv = setInterval(() => setZone(frameBus.spectateZone), SPECTATE_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  const notice = spectateNotice(zone);
  if (!notice.show) return null;

  return (
    <div
      // TOP of the screen on purpose. The bottom third is the ability bar and
      // the equipment row; the centre is the fight you are being asked to
      // watch. The top strip is where this game already puts state you are
      // meant to read rather than act on.
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: HUD_Z.expanded,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 18px",
        borderRadius: 999,
        border: "1px solid rgba(242,161,60,0.55)",
        background: "linear-gradient(180deg, rgba(28,22,12,0.92), rgba(18,14,8,0.92))",
        boxShadow: "0 6px 28px rgba(0,0,0,0.6)",
        maxWidth: "min(92vw, 640px)",
        // one line on a desktop, wraps rather than overflows on a phone
        textAlign: "center",
      }}
      role="status"
      aria-live="polite"
    >
      {/* a slow pulse, so it reads as LIVE rather than as a stuck label */}
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "#f2a13c",
          flexShrink: 0,
          animation: "ggd-spectate-pulse 1.6s ease-in-out infinite",
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 700, color: "#f6e3c0", letterSpacing: "0.5px" }}>
        {notice.text}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "#d9b26a",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {notice.zoneLabel}
      </span>
      {/* Scoped keyframes, declared here rather than in a global sheet so the
          banner carries its own animation and cannot be broken by a stylesheet
          it does not own. `prefers-reduced-motion` drops the pulse entirely. */}
      <style>{`
        @keyframes ggd-spectate-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
        @media (prefers-reduced-motion: reduce) {
          [style*="ggd-spectate-pulse"] { animation: none !important }
        }
      `}</style>
    </div>
  );
}
