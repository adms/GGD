/**
 * GoldLevel — local seat gold / level / xp readout.
 *
 * Claims the "gold-level" slot at the bottom of the bottom-right stack (#107).
 * It used to hard-pin `right:14 / bottom:14` against `HUD_EDGE = 10` while its
 * registry row reserved only 56px of height — and the box is really 61px tall
 * once the "+N skill pt" line appears, so its far edge landed at 75px against
 * the minimap's band start of 74. A measured 1px overlap that nothing could
 * catch, because an unmanaged slot is invisible to the layout guard. Reading
 * the position from the registry makes the pin and the reservation the same
 * fact; the row now reserves the measured worst case.
 */
import { useHud } from "../../net/RoomStore";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotStyle } from "../hud/hudLayout";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

export function GoldLevel(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const touch = hudTouch();
  if (!seat) return null;
  return (
    <div
      data-hud-slot="gold-level"
      style={{
        ...hudSlotStyle("gold-level", touch),
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
