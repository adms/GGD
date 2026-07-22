/**
 * MatchEndPanel — the victory-settlement screen (task #25, part C). Once the
 * match ends the server broadcasts the full per-player scoreboard; this renders:
 *   - the local player's big COLORED grade (S+ gold … C- grey) + headline,
 *   - a per-stat breakdown with short data-driven reflection hints,
 *   - the full per-player RANKING table (rank · portrait · name · grade · KDA),
 *   - a "查看戰績變化" button (+ auto-advance) to the leaderboard delta screen.
 *
 * The ranking list AUTO-SCROLLS (task #36): it opens pinned at rank 1, holds so
 * the top of the board is readable, then eases down until the local player's row
 * is centered and pulses it — nobody has to hunt for their own name. The first
 * manual wheel/touch/drag/key input cancels it for good, and reduced-motion
 * renders already-scrolled. Rules + math: ../scroll/autoScroll.
 *
 * All numeric/textual logic lives in ./settlementModel (pure, unit-tested); this
 * file is the JSX shell. Falls back to the old team-placement list until the
 * settlement payload arrives (or if it never does — e.g. a very old server).
 */
import { useEffect, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { SettlementPlayer } from "@ggd/shared/protocol/messages";
import { useHud } from "../../net/RoomStore";
import { useApp } from "../platform/store";
import { championIconUrl } from "../icons";
import { GlyphTile } from "../components/GlyphTile";
import { Btn } from "../platform/widgets";
import {
  buildStatBreakdown,
  gradeColor,
  gradeHeadline,
  isWinner,
  localSettlementCard,
  formatKda,
  reflectionHints,
  sortSettlementRanking,
} from "./settlementModel";
import {
  AUTO_SCROLL_HIGHLIGHT_CSS,
  highlightClass,
  useAutoScrollToRow,
  type AutoScrollToRowHandle,
} from "../scroll/useAutoScrollToRow";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

/** Seconds on the settlement screen before it auto-advances to the leaderboard. */
const AUTO_ADVANCE_SEC = 18;

/**
 * Height of the ranking list's own scroll window. Bounded (rather than letting
 * the whole card scroll) so "pinned at rank 1 → centered on you" is a real,
 * legible travel on a 12-player board instead of a page-length jump.
 */
const RANK_LIST_MAX_H = "min(38vh, 252px)";

const PLACE_LABEL = ["", "1st", "2nd", "3rd", "4th"];

function championName(champ: string): string {
  return Champions.tryGet(champ as ChampionId)?.name ?? champ;
}

/** Champion portrait, or the shared procedural tile when the w3x art is absent. */
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

/** The big colored grade splash for the local player's card. */
function GradeSplash(props: { player: SettlementPlayer; won: boolean }): React.JSX.Element {
  const { player, won } = props;
  const color = gradeColor(player.grade);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
      <div
        style={{
          fontSize: 72,
          lineHeight: 1,
          fontWeight: 900,
          color,
          textShadow: `0 0 22px ${color}66`,
          minWidth: 120,
          textAlign: "center",
        }}
      >
        {player.grade}
      </div>
      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: won ? "#f2c637" : TEXT_MAIN }}>
          {won ? "勝利！" : "戰鬥結束"}
        </div>
        <div style={{ fontSize: 14, color, fontWeight: 700, marginTop: 2 }}>{gradeHeadline(player.grade)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <ChampPortrait champ={player.champ} size={30} />
          <span style={{ fontSize: 14, color: TEXT_MAIN, fontWeight: 700 }}>{championName(player.champ)}</span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>#{player.rank} · {formatKda(player.stats)}</span>
        </div>
      </div>
    </div>
  );
}

/** Data-driven coaching lines for the local player. */
function Reflections(props: { player: SettlementPlayer }): React.JSX.Element {
  const hints = reflectionHints(props.player.stats, props.player.role, props.player.grade);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      {hints.map((h, i) => {
        const praise = h.tone === "praise";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12.5,
              color: TEXT_MAIN,
              background: praise ? "rgba(71,204,106,0.12)" : "rgba(242,198,55,0.10)",
              border: `1px solid ${praise ? "rgba(71,204,106,0.5)" : "rgba(242,198,55,0.45)"}`,
            }}
          >
            <span aria-hidden>{praise ? "✦" : "◆"}</span>
            <span>{h.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The local player's full per-stat breakdown grid. */
function StatBreakdown(props: { player: SettlementPlayer }): React.JSX.Element {
  const rows = buildStatBreakdown(props.player.stats);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px 18px",
        marginBottom: 16,
      }}
    >
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", borderBottom: "1px solid rgba(120,140,190,0.12)" }}
        >
          <span style={{ color: TEXT_DIM }}>{r.label}</span>
          <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The full per-player ranking table (rank · portrait · name · grade · KDA · dmg).
 * The header stays put; only the rows scroll — the auto-scroll drives that inner
 * list (props.scroll.listRef) and reveals the local row (props.scroll.rowRef).
 */
function RankingTable(props: {
  players: readonly SettlementPlayer[];
  localSeatId: number | null;
  winnerTeam: number;
  nameForSeat: (seatId: number) => string;
  scroll: AutoScrollToRowHandle<HTMLDivElement, HTMLDivElement>;
}): React.JSX.Element {
  const ordered = sortSettlementRanking(props.players);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: TEXT_DIM, letterSpacing: 0.6, textTransform: "uppercase", padding: "0 8px 4px" }}>
        <span style={{ width: 26 }}>#</span>
        <span style={{ width: 26 }} />
        <span style={{ flex: 1 }}>玩家</span>
        <span style={{ width: 34, textAlign: "center" }}>評級</span>
        <span style={{ width: 66, textAlign: "right" }}>K / D / A</span>
        <span style={{ width: 60, textAlign: "right" }}>傷害</span>
      </div>
      <div
        ref={props.scroll.listRef}
        style={{ maxHeight: RANK_LIST_MAX_H, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}
      >
        {ordered.map((p) => {
          const isLocal = p.seatId === props.localSeatId;
          const won = isWinner(props.winnerTeam, p.teamId);
          const gc = gradeColor(p.grade);
          return (
            <div
              key={p.seatId}
              {...(isLocal ? { ref: props.scroll.rowRef, className: highlightClass(props.scroll.highlight) } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 6,
                fontSize: 12,
                flexShrink: 0,
                // stable row height (portrait 26 + 2×5 padding + 2×1 border) so a
                // late/404 portrait can never reflow the list under the auto-scroll
                minHeight: 38,
                boxSizing: "border-box",
                background: isLocal ? "rgba(80,100,160,0.32)" : "rgba(30,36,52,0.5)",
                border: isLocal ? "1px solid rgba(140,160,220,0.5)" : "1px solid transparent",
              }}
            >
              <span style={{ width: 26, fontWeight: 800, color: p.rank <= 3 ? "#f2c637" : TEXT_DIM }}>{p.rank}</span>
              <ChampPortrait champ={p.champ} size={26} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: teamCss(p.teamId), fontWeight: 600 }}>
                {props.nameForSeat(p.seatId)}
                {won && <span style={{ color: "#f2c637", marginLeft: 5 }}>👑</span>}
              </span>
              <span style={{ width: 34, textAlign: "center", fontWeight: 900, color: gc }}>{p.grade}</span>
              <span style={{ width: 66, textAlign: "right", color: TEXT_MAIN }}>{formatKda(p.stats)}</span>
              <span style={{ width: 60, textAlign: "right", color: TEXT_DIM }}>{Math.round(p.stats.damageDealt).toLocaleString("en-US")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legacy fallback: team placements only (settlement payload not yet received). */
function TeamPlacementFallback(): React.JSX.Element {
  const teams = useHud((s) => s.teams);
  const seats = useHud((s) => s.seats);
  const localTeamId = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? null;
  });
  const returnToLobby = useApp((s) => s.returnToLobby);
  const ordered = [...teams].sort((a, b) => (a.placement || 9) - (b.placement || 9));
  return (
    <div style={cardStyle(380)}>
      <div style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>
        {localTeamId !== null && ordered[0]?.teamId === localTeamId ? "勝利！" : "戰鬥結束"}
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 14 }}>最終名次</div>
      {ordered.map((t) => (
        <div
          key={t.teamId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 10px",
            marginBottom: 4,
            borderRadius: 6,
            background: t.teamId === localTeamId ? "rgba(80,100,160,0.3)" : "rgba(30,36,52,0.6)",
          }}
        >
          <span style={{ fontWeight: "bold", color: teamCss(t.teamId) }}>
            {PLACE_LABEL[t.placement] ?? "—"} · Team {t.teamId + 1}
          </span>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {seats.filter((s) => s.teamId === t.teamId).map((s) => s.displayName || `Seat ${s.seatId}`).join(", ")}
          </span>
        </div>
      ))}
      <Btn kind="primary" onClick={() => void returnToLobby()} style={{ marginTop: 12 }}>
        返回大廳
      </Btn>
    </div>
  );
}

function cardStyle(width: number | string): React.CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width,
    padding: 20,
    background: PANEL_BG,
    border: PANEL_BORDER,
    borderRadius: 12,
    color: TEXT_MAIN,
    pointerEvents: "auto",
    textAlign: "center",
  };
}

export function MatchEndPanel(): React.JSX.Element {
  const settlement = useHud((s) => s.settlement);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const viewRankChange = useApp((s) => s.viewRankChange);
  const returnToLobby = useApp((s) => s.returnToLobby);

  const hasPayload = settlement !== null && settlement.perPlayer.length > 0;

  // auto-advance to the leaderboard delta screen after a grace period. The
  // countdown updater stays pure (no navigation side-effect inside setState); a
  // separate effect fires the transition exactly once when it reaches 0.
  const [secsLeft, setSecsLeft] = useState(AUTO_ADVANCE_SEC);
  useEffect(() => {
    if (!hasPayload) return;
    setSecsLeft(AUTO_ADVANCE_SEC);
    const iv = setInterval(() => setSecsLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(iv);
  }, [hasPayload]);
  useEffect(() => {
    if (hasPayload && secsLeft === 0) viewRankChange();
  }, [hasPayload, secsLeft, viewRankChange]);

  const players = hasPayload ? settlement.perPlayer : [];
  const local = localSettlementCard(players, localSeatId);
  // Arm the ranking auto-scroll once per match — only when there IS a local row
  // to reveal (spectators / a missing seat leave the list untouched). Hooks must
  // run before the fallback early-return below.
  const scroll = useAutoScrollToRow<HTMLDivElement, HTMLDivElement>({
    runKey: local ? `settle-${settlement?.matchId || "offline"}` : null,
  });

  if (!hasPayload) return <TeamPlacementFallback />;

  const won = isWinner(settlement.winnerTeam, local?.teamId ?? null);
  const nameForSeat = (seatId: number): string =>
    seats.find((s) => s.seatId === seatId)?.displayName || `Seat ${seatId}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 40%, rgba(10,14,24,0.55) 0%, rgba(6,8,14,0.86) 70%)",
        pointerEvents: "auto",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "min(760px, 96vw)",
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
        <style>{AUTO_SCROLL_HIGHLIGHT_CSS}</style>
        {local ? (
          <>
            <GradeSplash player={local} won={won} />
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>個人數據</div>
            <StatBreakdown player={local} />
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>賽後檢討</div>
            <Reflections player={local} />
          </>
        ) : (
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, textAlign: "center", color: won ? "#f2c637" : TEXT_MAIN }}>
            {won ? "勝利！" : "戰鬥結束"}
          </div>
        )}

        <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>本場排名</div>
        <RankingTable
          players={players}
          localSeatId={localSeatId}
          winnerTeam={settlement.winnerTeam}
          nameForSeat={nameForSeat}
          scroll={scroll}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <Btn kind="primary" onClick={() => viewRankChange()} style={{ flex: 1 }}>
            查看戰績變化
          </Btn>
          <Btn onClick={() => void returnToLobby()}>返回大廳</Btn>
          <span style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}>{secsLeft}s 後自動前往</span>
        </div>
      </div>
    </div>
  );
}
