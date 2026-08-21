/**
 * LeaveSettlementOverlay — the evaluation screen a knocked-out player sees when
 * they choose to leave mid-match (task #193). Their team's life is gone but the
 * match runs on for the survivors, so `phase` is still combat/resolution and
 * MatchEndPanel is NOT up; without this the pause menu's 返回大廳 dropped them
 * straight to the lobby with no settlement at all.
 *
 * It renders only while the store's `leaveGate` is set (opened by ui/leaveFlow
 * for an eliminated player who asked to leave). The card is the per-team
 * settlement the server broadcast the moment their team went out
 * (TEAM_SETTLEMENT_EVENT → RoomStore.settlement); 返回大廳 confirms → lobby,
 * 繼續觀戰 dismisses back to spectating.
 *
 * Z-ORDER (the second of the two prior defects): it paints at HUD_Z.modal, the
 * top of the in-HUD stack, so nothing — not the leave chip, not a slot panel —
 * can sit over the card. A settlement the player cannot read is the same as no
 * settlement.
 */
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { SettlementPlayer } from "@ggd/shared/protocol/messages";
import { useHud } from "../../net/RoomStore";
import { useApp } from "../platform/store";
import { HUD_Z } from "../hud/hudLayout";
import { championIconUrl } from "../icons";
import { GlyphTile } from "../components/GlyphTile";
import { Btn } from "../platform/widgets";
import {
  buildStatBreakdown,
  formatKda,
  gradeColor,
  gradeHeadline,
  isWinner,
  localSettlementCard,
  sortSettlementRanking,
} from "./settlementModel";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";
import { padModalScope } from "../padModalScope";

function championName(champ: string): string {
  return Champions.tryGet(champ as ChampionId)?.name ?? champ;
}

function ChampPortrait(props: { champ: string; size: number }): React.JSX.Element {
  return (
    <GlyphTile
      seed={props.champ}
      src={championIconUrl(props.champ)}
      label={championName(props.champ)}
      size={props.size}
      radius={6}
    />
  );
}

function GradeHeader(props: { player: SettlementPlayer }): React.JSX.Element {
  const { player } = props;
  const color = gradeColor(player.grade);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
      <div
        style={{
          fontSize: 58,
          lineHeight: 1,
          fontWeight: 900,
          color,
          textShadow: `0 0 20px ${color}66`,
          minWidth: 96,
          textAlign: "center",
        }}
      >
        {player.grade}
      </div>
      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: TEXT_MAIN }}>戰鬥結束</div>
        <div style={{ fontSize: 13, color, fontWeight: 700, marginTop: 2 }}>
          {gradeHeadline(player.grade)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <ChampPortrait champ={player.champ} size={26} />
          <span style={{ fontSize: 13, color: TEXT_MAIN, fontWeight: 700 }}>
            {championName(player.champ)}
          </span>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            #{player.rank} · {formatKda(player.stats)}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatGrid(props: { player: SettlementPlayer }): React.JSX.Element {
  const rows = buildStatBreakdown(props.player.stats);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 18px", marginBottom: 14 }}>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            padding: "2px 0",
            borderBottom: "1px solid rgba(120,140,190,0.12)",
          }}
        >
          <span style={{ color: TEXT_DIM }}>{r.label}</span>
          <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Ranking(props: {
  players: readonly SettlementPlayer[];
  localSeatId: number | null;
  winnerTeam: number;
  nameForSeat: (seatId: number) => string;
}): React.JSX.Element {
  const ordered = sortSettlementRanking(props.players);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10.5,
          color: TEXT_DIM,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          padding: "0 8px 4px",
        }}
      >
        <span style={{ width: 26 }}>#</span>
        <span style={{ width: 26 }} />
        <span style={{ flex: 1 }}>玩家</span>
        <span style={{ width: 34, textAlign: "center" }}>評級</span>
        <span style={{ width: 66, textAlign: "right" }}>K / D / A</span>
      </div>
      <div style={{ maxHeight: "min(34vh, 220px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {ordered.map((p) => {
          const isLocal = p.seatId === props.localSeatId;
          const won = isWinner(props.winnerTeam, p.teamId);
          const gc = gradeColor(p.grade);
          return (
            <div
              key={p.seatId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 6,
                fontSize: 12,
                flexShrink: 0,
                minHeight: 38,
                boxSizing: "border-box",
                background: isLocal ? "rgba(80,100,160,0.32)" : "rgba(30,36,52,0.5)",
                border: isLocal ? "1px solid rgba(140,160,220,0.5)" : "1px solid transparent",
              }}
            >
              <span style={{ width: 26, fontWeight: 800, color: p.rank <= 3 ? "#f2c637" : TEXT_DIM }}>{p.rank}</span>
              <ChampPortrait champ={p.champ} size={26} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: teamCss(p.teamId),
                  fontWeight: 600,
                }}
              >
                {props.nameForSeat(p.seatId)}
                {won && <span style={{ color: "#f2c637", marginLeft: 5 }}>👑</span>}
              </span>
              <span style={{ width: 34, textAlign: "center", fontWeight: 900, color: gc }}>{p.grade}</span>
              <span style={{ width: 66, textAlign: "right", color: TEXT_MAIN }}>{formatKda(p.stats)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeaveSettlementOverlay(): React.JSX.Element | null {
  const leaveGate = useApp((s) => s.leaveGate);
  const returnToLobby = useApp((s) => s.returnToLobby);
  const closeLeaveGate = useApp((s) => s.closeLeaveGate);
  const settlement = useHud((s) => s.settlement);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);

  if (!leaveGate) return null;

  const players = settlement?.perPlayer ?? [];
  const local = localSettlementCard(players, localSeatId);
  const nameForSeat = (seatId: number): string =>
    seats.find((s) => s.seatId === seatId)?.displayName || `Seat ${seatId}`;

  return (
    <div
      // GH#504 — 60, 與 LeaveConfirmDialog 同級。⚠️ 這一格是 blocker：這張卡
      // 出現在 combat/resolution，而那兩個相位在 COMBAT_LIVE_PHASES 裡，
      // `focusNavActive` 在**沒有 scope** 時回 false ⇒ 焦點層整個站下來，
      // 「返回大廳」「繼續觀戰」兩顆對純手把玩家都不存在。宣告 scope 是唯一
      // 把焦點層翻回來的開關（⛔ 不是去改 COMBAT_LIVE_PHASES —— 那條規則對
      // 還活著的玩家仍然要成立）。
      {...padModalScope("leave-settlement")}
      style={{
        position: "absolute",
        inset: 0,
        // top of the in-HUD stack — nothing may paint over the settlement card
        // (the second prior defect). A blocking terminal choice out-ranks slots.
        zIndex: HUD_Z.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,9,15,0.72)",
        backdropFilter: "blur(3px) brightness(0.7)",
        WebkitBackdropFilter: "blur(3px) brightness(0.7)",
        pointerEvents: "auto",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(680px, 96vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 14,
          padding: 20,
          color: TEXT_MAIN,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          你的隊伍已淘汰 · 賽後評價
        </div>
        {local ? (
          <>
            <GradeHeader player={local} />
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>個人數據</div>
            <StatGrid player={local} />
          </>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, textAlign: "center", color: TEXT_MAIN }}>
            戰鬥結束
          </div>
        )}

        {players.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>本場排名</div>
            <Ranking
              players={players}
              localSeatId={localSeatId}
              winnerTeam={settlement?.winnerTeam ?? -1}
              nameForSeat={nameForSeat}
            />
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <Btn kind="primary" onClick={() => void returnToLobby()} style={{ flex: 1 }}>
            返回大廳
          </Btn>
          {/* ⭐ 只有「繼續觀戰」是 back：它是安全的 dismissal。
              ⛔「返回大廳」被 BACK_VETO_RE 擋住是**對的** —— B 不可以一按就退賽。 */}
          <Btn padBack onClick={() => closeLeaveGate()}>繼續觀戰</Btn>
        </div>
      </div>
    </div>
  );
}
