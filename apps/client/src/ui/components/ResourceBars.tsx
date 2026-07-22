/** ResourceBars — local champion HP / mana (+shield) above the ability bar. */
import { useHud } from "../../net/RoomStore";
import { PANEL_BG, PANEL_BORDER } from "../theme";

function Bar(props: {
  value: number;
  max: number;
  extra?: number;
  color: string;
  extraColor?: string;
}): React.JSX.Element {
  const pct = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  const extraPct =
    props.max > 0 && props.extra ? Math.min(1 - pct, props.extra / props.max) : 0;
  return (
    <div
      style={{
        position: "relative",
        height: 14,
        background: "#10141d",
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 3,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: props.color }} />
      {extraPct > 0 && (
        <div
          style={{
            position: "absolute",
            left: `${pct * 100}%`,
            top: 0,
            bottom: 0,
            width: `${extraPct * 100}%`,
            background: props.extraColor ?? "#cfd6e4",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          textAlign: "center",
          fontSize: 10,
          lineHeight: "14px",
          color: "#fff",
          textShadow: "0 1px 2px #000",
        }}
      >
        {Math.round(props.value)} / {Math.round(props.max)}
        {props.extra ? ` (+${Math.round(props.extra)})` : ""}
      </div>
    </div>
  );
}

export function ResourceBars(): React.JSX.Element | null {
  const hp = useHud((s) => s.localHp);
  const maxHp = useHud((s) => s.localMaxHp);
  const mana = useHud((s) => s.localMana);
  const maxMana = useHud((s) => s.localMaxMana);
  const shield = useHud((s) => s.localShield);
  if (maxHp <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 128,
        transform: "translateX(-50%)",
        width: 260,
        padding: "6px 8px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 6,
      }}
    >
      <Bar value={hp} max={maxHp} extra={shield} color="#3fae5a" />
      <Bar value={mana} max={maxMana} color="#3f7fd1" />
    </div>
  );
}
