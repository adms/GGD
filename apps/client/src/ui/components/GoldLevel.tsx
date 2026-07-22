/** GoldLevel — local seat gold / level / xp readout. */
import { useHud } from "../../net/RoomStore";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

export function GoldLevel(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  if (!seat) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: 14,
        padding: "8px 12px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_MAIN,
        fontSize: 12,
        textAlign: "right",
      }}
    >
      <div style={{ color: GOLD, fontSize: 15, fontWeight: "bold" }}>{seat.gold} g</div>
      <div>
        Lv {seat.level}
        <span style={{ color: TEXT_DIM }}> · {seat.xp} xp</span>
      </div>
      {seat.unspentPoints > 0 && (
        <div style={{ color: GOLD, fontSize: 10 }}>+{seat.unspentPoints} skill pt</div>
      )}
    </div>
  );
}
