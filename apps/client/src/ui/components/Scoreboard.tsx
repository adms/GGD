/**
 * Scoreboard — K/D per seat (client-tallied from death events), by team.
 * Top-right corner stack, slot 1 (under the Leave button) — ui/hud/hudLayout.
 */
import { useState } from "react";
import { useHud } from "../../net/RoomStore";
import { championIconUrl } from "../icons";
import { IconImg } from "./IconImg";
import { SfxButton } from "../SfxButton";
import { hudTouch } from "../hud/HudSlot";
import { HUD_Z, hudSlotHeight, hudSlotStyle } from "../hud/hudLayout";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

export function Scoreboard(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const seats = useHud((s) => s.seats);
  const kills = useHud((s) => s.kills);
  const deaths = useHud((s) => s.deaths);
  const localSeatId = useHud((s) => s.localSeatId);
  const touch = hudTouch();

  return (
    <div
      data-hud-slot="scoreboard"
      // while open the K/D list overhangs the slots below it — paint above them
      style={{
        ...hudSlotStyle("scoreboard", touch, open ? HUD_Z.expanded : HUD_Z.slot),
        pointerEvents: "auto",
      }}
    >
      <SfxButton
        onClick={() => setOpen((v) => !v)}
        sfxVolume={0.6}
        style={{
          minHeight: hudSlotHeight("scoreboard", touch),
          padding: "5px 10px",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        {open ? "Hide" : "Scoreboard"}
      </SfxButton>
      {open && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 8,
            fontSize: 11,
            color: TEXT_MAIN,
            minWidth: 220,
          }}
        >
          {seats.map((seat) => (
            <div
              key={seat.seatId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "2px 4px",
                background: seat.seatId === localSeatId ? "rgba(80,100,160,0.25)" : "transparent",
                borderRadius: 3,
              }}
            >
              <span style={{ color: teamCss(seat.teamId), width: 90, overflow: "hidden", whiteSpace: "nowrap" }}>
                {seat.displayName || `Seat ${seat.seatId}`}
                {seat.driver === "ai" ? " (AI)" : ""}
              </span>
              <span style={{ color: TEXT_DIM, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {/* champion portrait — icon-less heroes keep the id text alone */}
                <IconImg src={championIconUrl(seat.championId)} size={14} alt="" />
                {seat.championId || "—"}
              </span>
              <span>
                {kills[seat.seatId] ?? 0}/{deaths[seat.seatId] ?? 0}
              </span>
              <span style={{ color: TEXT_DIM }}>Lv{seat.level}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
