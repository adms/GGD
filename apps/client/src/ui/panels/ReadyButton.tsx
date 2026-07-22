/** ReadyButton — intermission ready-up (combat starts when all are ready). */
import { useHud } from "../../net/RoomStore";
import { hudActions } from "../actions";
import { SfxButton } from "../SfxButton";
import { PANEL_BORDER, TEXT_DIM } from "../theme";

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
