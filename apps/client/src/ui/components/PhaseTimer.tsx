/** PhaseTimer — phase name, round number, countdown (phaseTicksLeft/TICK_HZ). */
import { useHud } from "../../net/RoomStore";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  champSelect: "Champion Select",
  intermission: "Prepare",
  combat: "Combat",
  resolution: "Round Over",
  matchEnd: "Match Complete",
};

export function PhaseTimer(): React.JSX.Element {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const secs = useHud((s) => s.phaseSecondsLeft);
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "6px 16px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        textAlign: "center",
        color: TEXT_MAIN,
      }}
    >
      <div style={{ fontSize: 12 }}>
        {PHASE_LABEL[phase] ?? phase}
        {round > 0 && <span style={{ color: TEXT_DIM }}> · Round {round}</span>}
      </div>
      <div style={{ fontSize: 18, fontWeight: "bold" }}>
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </div>
    </div>
  );
}
