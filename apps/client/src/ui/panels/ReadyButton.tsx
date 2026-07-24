/** ReadyButton — intermission ready-up (combat starts when all are ready). */
import { useHud } from "../../net/RoomStore";
import { hudActions } from "../actions";
import { SfxButton } from "../SfxButton";
import { PANEL_BORDER, TEXT_DIM } from "../theme";
import { INTERMISSION_Z } from "./intermissionLayout";

export function ReadyButton(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const readyCount = useHud((s) => s.seats.filter((v) => v.ready).length);
  const total = useHud((s) => s.seats.length);
  if (!seat) return null;

  return (
    <div
      style={{
        position: "absolute",
        // Band 3 (PANEL) — the same band as the shop card, which the module doc
        // has always said Ready rides in. It has to be SAID now that the card
        // carries a real z: a centred button at bottom:190 overlaps a 45vw left
        // dock on any viewport narrower than ~1300px, so leaving Ready at the
        // default layer would bury it under the card. Still BELOW `focusScrim`,
        // so an unanswered draft demotes and click-blocks it exactly as before.
        zIndex: INTERMISSION_Z.panel,
        left: "50%",
        bottom: 190,
        transform: "translateX(-50%)",
        textAlign: "center",
        pointerEvents: "auto",
      }}
    >
      <SfxButton
        disabled={seat.ready}
        onClick={() => hudActions.sendCommand({ kind: "ready" })}
        style={{
          padding: "10px 34px",
          fontSize: 15,
          fontWeight: "bold",
          borderRadius: 8,
          border: PANEL_BORDER,
          background: seat.ready ? "#1d4028" : "#2c3f6b",
          color: seat.ready ? "#7fd898" : "#e8ecf4",
          cursor: seat.ready ? "default" : "pointer",
        }}
      >
        {seat.ready ? "Ready!" : "Ready up"}
      </SfxButton>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
        {readyCount}/{total} ready
      </div>
    </div>
  );
}
