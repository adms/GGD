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
import { hudSlotScaleTier, hudSlotStyle, hudSlotWidth } from "../hud/hudLayout";
import { hudScale, type HudScaleTier } from "../hudScale";
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

/**
 * Every px this panel paints, at the tier it is really laid out at (owner
 * 2026-08-10: 「包含整體圖案框架與字體」 — so the frame, the borders, the
 * padding AND the type all move together; scaling only the text would push it
 * straight out of a frame that never grew).
 *
 * It is a PURE function of (touch, tier) so the guard can read the numbers the
 * component will actually paint, instead of asserting that a settings object
 * has a field in it (failure form ⑦). Every number below is the SHIPPED value
 * fed through the operator, and the operator returns 中 bit-for-bit — which is
 * what makes "a player who never opens settings sees no change" structural
 * rather than a promise.
 */
export function enemyPanelChrome(
  touch: boolean,
  tier: HudScaleTier = hudSlotScaleTier("enemy-team", touch),
): {
  padX: number;
  padY: number;
  radius: number;
  gap: number;
  borderPx: number;
  titleFont: number;
  titleTracking: number;
  rowGap: number;
  rowPadY: number;
  rowPadR: number;
  rowPadL: number;
  rowRadius: number;
  teamBarPx: number;
  iconPx: number;
  iconRadius: number;
  nameFont: number;
  nameLine: number;
  hpBarPx: number;
  mpBarPx: number;
  barFont: number;
  barRadius: number;
  barGap: number;
} {
  const s = (px: number): number => hudScale(px, tier);
  return {
    padX: s(touch ? 5 : 6),
    padY: s(touch ? 3 : 5),
    radius: s(8),
    gap: s(touch ? 2 : 3),
    borderPx: s(1),
    titleFont: s(9),
    titleTracking: s(0.5),
    rowGap: s(6),
    rowPadY: s(touch ? 1 : 2),
    rowPadR: s(4),
    rowPadL: s(touch ? 5 : 6),
    rowRadius: s(2),
    teamBarPx: s(3),
    iconPx: s(20),
    iconRadius: s(3),
    nameFont: s(10),
    nameLine: s(13),
    hpBarPx: s(touch ? 9 : 10),
    mpBarPx: s(9),
    barFont: s(8),
    barRadius: s(2),
    barGap: s(2),
  };
}

type EnemyChrome = ReturnType<typeof enemyPanelChrome>;

/** A thin resource bar with an inline tabular-nums readout. */
function MiniBar(props: {
  value: number;
  max: number;
  color: string;
  height: number;
  chrome: EnemyChrome;
}): React.JSX.Element {
  const pct = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  return (
    <div
      style={{
        position: "relative",
        height: props.height,
        background: "#10141d",
        borderRadius: props.chrome.barRadius,
        overflow: "hidden",
        marginTop: props.chrome.barGap,
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
          fontSize: props.chrome.barFont,
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

function EnemyRow(props: {
  seat: SeatView;
  touch: boolean;
  chrome: EnemyChrome;
}): React.JSX.Element {
  const { seat, touch, chrome } = props;
  const tint = teamCss(seat.teamId);
  const dead = !seat.alive || seat.maxHp <= 0;
  const name = seat.displayName || seat.championId || `Seat ${seat.seatId}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: chrome.rowGap,
        padding: `${chrome.rowPadY}px ${chrome.rowPadR}px ${chrome.rowPadY}px ${chrome.rowPadL}px`,
        borderLeft: `${chrome.teamBarPx}px solid ${tint}`,
        borderRadius: chrome.rowRadius,
        opacity: dead ? 0.45 : 1,
      }}
    >
      {!touch && (
        <IconImg
          src={championIconUrl(seat.championId)}
          size={chrome.iconPx}
          alt=""
          style={{ borderRadius: chrome.iconRadius }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: chrome.rowGap,
            fontSize: chrome.nameFont,
            lineHeight: `${chrome.nameLine}px`,
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
        <MiniBar
          value={seat.hp}
          max={seat.maxHp}
          color="#3fae5a"
          height={chrome.hpBarPx}
          chrome={chrome}
        />
        {!touch && (
          <MiniBar
            value={seat.mana}
            max={seat.maxMana}
            color="#3f7fd1"
            height={chrome.mpBarPx}
            chrome={chrome}
          />
        )}
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
  // ⚠️ the SLOT's tier, not the raw player choice: hudLayout may have stepped it
  // down to keep the panel on screen, and the paint has to agree with the
  // reserve or the clamp is worse than no clamp.
  const chrome = enemyPanelChrome(touch);

  // combat-only, and only once the duel's enemies are resolved
  if (phase !== "combat" || hidden || enemies.length === 0) return null;

  return (
    <div
      data-hud-slot="enemy-team"
      style={{
        ...hudSlotStyle("enemy-team", touch),
        boxSizing: "border-box",
        width: hudSlotWidth("enemy-team", touch),
        padding: `${chrome.padY}px ${chrome.padX}px`,
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderWidth: chrome.borderPx,
        borderRadius: chrome.radius,
        display: "flex",
        flexDirection: "column",
        gap: chrome.gap,
        pointerEvents: "none",
      }}
    >
      {!touch && (
        <div
          style={{
            fontSize: chrome.titleFont,
            letterSpacing: chrome.titleTracking,
            color: TEXT_MAIN,
            opacity: 0.8,
          }}
        >
          敵方
        </div>
      )}
      {enemies.map((e) => (
        <EnemyRow key={e.seatId} seat={e} touch={touch} chrome={chrome} />
      ))}
    </div>
  );
}
