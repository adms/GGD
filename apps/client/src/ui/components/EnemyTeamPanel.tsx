/**
 * EnemyTeamPanel — a small, non-obtrusive top-left frame listing the three
 * enemies of the local player's CURRENT DUEL (HP / MP + a couple of basic
 * attributes). Claims the "enemy-team" slot in the top-left corner stack
 * (ui/hud/hudLayout) — it never pins its own corner. Combat-only, and hidden
 * while a left-docked shop covers the corner (task #107).
 *
 * WHY THIS IS SNAPSHOT-DERIVED, NOT A NEW SCHEMA FIELD: enemy hp/mp/zone/alive
 * already ride the entities map the overhead HP bars read; RoomStore now folds
 * them into each SeatView, so no server change was needed. Values are
 * change-guarded there, so a patch that moves no HUD-visible number re-renders
 * nothing.
 */
import { useMemo } from "react";
import { useHud, type SeatView } from "../../net/RoomStore";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotStyle, hudSlotWidth } from "../hud/hudLayout";
import { useHudSlotHidden } from "../hud/useHudPanels";
import { championIconUrl } from "../icons";
import { IconImg } from "./IconImg";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * The enemies the local player is fighting THIS duel — pure so the selection is
 * node-testable. Rules:
 *   • never the local player's own team;
 *   • only seated, spawned champions (entityId > 0);
 *   • sharing the local seat's duel ZONE (PairedDuels splits teams across two
 *     zones each round, so "different team" alone would show all nine rivals).
 * When the local seat has not spawned yet (zone < 0) the duel is unresolved, so
 * we only commit when a SINGLE opposing team exists (the 2-team case the task
 * calls out) and otherwise show nothing.
 */
export function selectDuelEnemies(seats: SeatView[], localSeatId: number | null): SeatView[] {
  if (localSeatId === null) return [];
  const local = seats.find((s) => s.seatId === localSeatId);
  if (!local) return [];
  const candidates = seats.filter((s) => s.teamId !== local.teamId && s.entityId > 0);
  const bySeat = (a: SeatView, b: SeatView): number => a.seatId - b.seatId;
  if (local.zone >= 0) {
    return candidates.filter((s) => s.zone === local.zone).sort(bySeat);
  }
  const teams = new Set(candidates.map((s) => s.teamId));
  return teams.size === 1 ? candidates.slice().sort(bySeat) : [];
}

/** A thin resource bar with an inline tabular-nums readout. */
function MiniBar(props: {
  value: number;
  max: number;
  color: string;
  height: number;
}): React.JSX.Element {
  const pct = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  return (
    <div
      style={{
        position: "relative",
        height: props.height,
        background: "#10141d",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct * 100}%`,
          background: props.color,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          textAlign: "center",
          fontSize: 8,
          lineHeight: `${props.height}px`,
          color: "#fff",
          textShadow: "0 1px 1px #000",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {props.value} / {props.max}
      </div>
    </div>
  );
}

function EnemyRow(props: { seat: SeatView; touch: boolean }): React.JSX.Element {
  const { seat, touch } = props;
  const tint = teamCss(seat.teamId);
  const dead = !seat.alive || seat.maxHp <= 0;
  const name = seat.displayName || seat.championId || `Seat ${seat.seatId}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: touch ? "1px 4px 1px 5px" : "2px 4px 2px 6px",
        borderLeft: `3px solid ${tint}`,
        borderRadius: 2,
        opacity: dead ? 0.45 : 1,
      }}
    >
      {!touch && (
        <IconImg src={championIconUrl(seat.championId)} size={20} alt="" style={{ borderRadius: 3 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 6,
            fontSize: 10,
            lineHeight: "13px",
          }}
        >
          <span
            style={{
              color: tint,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          {!touch && (
            <span style={{ color: TEXT_DIM, fontVariantNumeric: "tabular-nums" }}>
              {dead ? "☠" : `Lv${seat.level}`}
            </span>
          )}
        </div>
        <MiniBar value={seat.hp} max={seat.maxHp} color="#3fae5a" height={touch ? 9 : 10} />
        {!touch && <MiniBar value={seat.mana} max={seat.maxMana} color="#3f7fd1" height={9} />}
      </div>
    </div>
  );
}

export function EnemyTeamPanel(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const touch = hudTouch();
  // hides while a left-docked shop covers the top-left corner (task #107)
  const hidden = useHudSlotHidden("enemy-team", touch);
  const enemies = useMemo(() => selectDuelEnemies(seats, localSeatId), [seats, localSeatId]);

  // combat-only, and only once the duel's enemies are resolved
  if (phase !== "combat" || hidden || enemies.length === 0) return null;

  return (
    <div
      data-hud-slot="enemy-team"
      style={{
        ...hudSlotStyle("enemy-team", touch),
        boxSizing: "border-box",
        width: hudSlotWidth("enemy-team", touch),
        padding: touch ? "3px 5px" : "5px 6px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: touch ? 2 : 3,
        pointerEvents: "none",
      }}
    >
      {!touch && (
        <div style={{ fontSize: 9, letterSpacing: 0.5, color: TEXT_MAIN, opacity: 0.8 }}>敵方</div>
      )}
      {enemies.map((e) => (
        <EnemyRow key={e.seatId} seat={e} touch={touch} />
      ))}
    </div>
  );
}
