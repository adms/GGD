/**
 * RoundVictoryPanel — 回合勝利畫面的 UI 外殼 (#212).
 *
 * 它**不是**那三個 3D 模型。模型是 `render/RoundWinnerStage` 在畫的(#143:
 * MVP 在前、整隊排成一列、灰色底 + 嘲諷台詞),由 `GameApp.updateRoundWinner`
 * 在 `resolution` 這個相位邊緣觸發。這一片是疊在它旁邊的**文字卡**:
 * 評價 + 建議 + 團隊累積積分 —— 也就是 owner 那句話裡模型以外的兩件事。
 *
 * ── 它取代了什麼 ────────────────────────────────────────────────────────────
 * `resolution` 相位以前只有一個寫著 “Round over” 的方框。整個回合結束的節拍
 * 上,玩家拿不到任何關於自己剛剛打得如何的資訊,而遊戲**已經**算得出來。
 *
 * ── 版位 (#107 安全區契約) ──────────────────────────────────────────────────
 * 卡片貼**右側**、垂直置中,並且明文讓開右上角的常駐 chrome(音訊叢集 / 設定)
 * ——寬度與 `top` 都從 `topRightClear()` 推,不是猜一個 magic number。
 * 中央整條留給 3D 模型列:模型是 owner 點名的主角,一張蓋住它的卡片會是
 * 「做了但玩家看不到」的另一種寫法。
 *
 * ⚠️ 它**不註冊 HUD slot**。`hudLayout` 的 skipTransient 堆疊尾端是 `fps`,
 * 加一個 order > 1 的非 transient slot 會讓 `hudLayout.test.ts` 掛;而這片卡
 * 只在 `resolution` 出現、不是常駐 chrome,本來就不該進那張表。
 *
 * ── 為什麼分成兩個 component ────────────────────────────────────────────────
 * `RoundVictoryView` 是純 props,所以整張卡在 node env 用 `react-dom/server`
 * 就渲染得出來 —— 每一條斷言都讀**畫面吐出來的字串**,不是模型的回傳值。
 */
import { useEffect, useMemo } from "react";
import { useHud } from "../../net/RoomStore";
import { topRightClear } from "../chromeReserve";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, teamCss } from "../theme";
import { INTERMISSION_Z } from "./intermissionLayout";
import {
  ROUND_VICTORY_BASIS,
  ROUND_VICTORY_COLOR,
  buildRoundVictory,
  type RoundVictoryModel,
} from "./roundVictory";
import {
  formatLedgerScope,
  formatTeamPoints,
  teamLedger,
  teamStandings,
  type TeamStanding,
} from "./teamLedger";

/** The store-connected half: reads the HUD, feeds the ledger, renders the view. */
export function RoundVictoryPanel(): React.JSX.Element | null {
  const matchId = useHud((s) => s.matchId);
  const round = useHud((s) => s.round);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const teams = useHud((s) => s.teams);

  const localTeamId = useMemo(() => {
    if (localSeatId === null) return null;
    return seats.find((s) => s.seatId === localSeatId)?.teamId ?? null;
  }, [seats, localSeatId]);

  const outcome = useMemo(
    () => (localTeamId === null ? 0 : (teams.find((t) => t.teamId === localTeamId)?.roundOutcome ?? 0)),
    [teams, localTeamId],
  );

  const model = useMemo(
    () =>
      buildRoundVictory({
        matchId,
        round,
        localTeamId,
        selfSeatId: localSeatId,
        outcome,
        seats: seats.map((s) => ({
          seatId: s.seatId,
          teamId: s.teamId,
          championId: s.championId,
          displayName: s.displayName || `Seat ${s.seatId}`,
          roundKills: s.roundKills,
          roundDeaths: s.roundDeaths,
          alive: s.alive,
          mobKills: s.mobKills ?? 0,
        })),
        // 上一回合的殭屍累積值:從帳本自己的紀錄推(roundVictory §3)。第一個
        // 記錄到的回合沒有前值 → 差為 0,寧可少算不要把整場的擊殺算成一回合的。
        prevMobKills: prevMobKillsFromLedger(),
      }),
    [matchId, round, localTeamId, localSeatId, outcome, seats],
  );

  // 記帳。`record` 以 round 為鍵覆寫,所以 React 重跑這個 effect 幾次都不會
  // 讓積分翻倍(teamLedger §3 —— 那是整個累積機制的安全帶)。
  useEffect(() => {
    if (model.ledgerEntries.length === 0) return;
    teamLedger.record(matchId, round, model.ledgerEntries);
    rememberMobKills(seats);
  }, [matchId, round, model, seats]);

  const standings = teamStandings();
  return (
    <RoundVictoryView
      model={model}
      standings={standings}
      localTeamId={localTeamId}
      roundsSeen={teamLedger.roundsSeen()}
    />
  );
}

/**
 * 每個座位「上一回合結束時」的 mobKills。
 *
 * 帳本記的是積分不是殭屍數,所以這一份放在模組層 —— 它是同一個生命週期的東西
 * (這一台機器、這一場),而且和帳本一樣**重連就沒了**,理由與代價同
 * teamLedger §3。刻意不塞進 zustand:它不驅動任何 render,塞進 store 只會讓
 * 每個回合多一次全 HUD 重繪。
 */
const mobKillsAtRoundEnd = new Map<number, number>();

function prevMobKillsFromLedger(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [seatId, kills] of [...mobKillsAtRoundEnd.entries()].sort((a, b) => a[0] - b[0])) {
    out[seatId] = kills;
  }
  return out;
}

function rememberMobKills(seats: readonly { seatId: number; mobKills?: number }[]): void {
  for (const s of seats) mobKillsAtRoundEnd.set(s.seatId, s.mobKills ?? 0);
}

/** 測試用:把 mobKills 的記憶清掉(帳本自己有 `clear`)。 */
export function resetRoundVictoryMemory(): void {
  mobKillsAtRoundEnd.clear();
}

const STATE_LABEL: Record<RoundVictoryModel["state"], string> = {
  victory: "回合勝利",
  defeat: "回合敗北",
  undecided: "回合結束",
  bye: "本回合輪空",
  "no-seat": "觀戰中",
};

/**
 * 純 props 的那一半。整張卡在 node env 就渲染得出來,所以
 * `roundVictory.test.ts` 讀的是**畫面**而不是模型的回傳值。
 */
export function RoundVictoryView({
  model,
  standings,
  localTeamId,
  roundsSeen,
  style,
}: {
  model: RoundVictoryModel;
  standings: readonly TeamStanding[];
  localTeamId: number | null;
  roundsSeen: number;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const graded = model.grade !== null;
  const accent = graded ? ROUND_VICTORY_COLOR[model.grade!.grade] : TEXT_DIM;
  return (
    <div
      data-ggd-round-victory={model.state}
      style={{
        position: "absolute",
        // #107: 讓開右上角的常駐 chrome,而且是用它自己公布的寬度讓,不是猜的。
        top: topRightClear({ gap: 8 }),
        right: 16,
        width: "min(340px, 34vw)",
        maxHeight: "72vh",
        overflowY: "auto",
        zIndex: INTERMISSION_Z.panel,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        color: TEXT_MAIN,
        fontSize: 12,
        pointerEvents: "none",
        ...style,
      }}
    >
      {/* ── 大字母 + 標題 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            fontSize: 38,
            lineHeight: 1,
            fontWeight: "bold",
            color: accent,
            minWidth: 38,
            textAlign: "center",
            textShadow: graded ? `0 0 16px ${accent}55` : "none",
          }}
        >
          {graded ? model.grade!.grade : "—"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: "0.04em" }}>
            第 {model.round} 回合 · {STATE_LABEL[model.state]}
          </div>
          <div style={{ fontSize: 13, fontWeight: "bold", color: accent, lineHeight: 1.25 }}>
            {model.headline}
          </div>
        </div>
      </div>

      {/* ── 這個等第看過什麼(不可以省) ── */}
      {graded && (
        <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.35 }}>{ROUND_VICTORY_BASIS}</div>
      )}

      {/* ── 打得好的地方 ── */}
      {model.strengths.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {model.strengths.map((line) => (
            <div
              key={line.code}
              data-ggd-round-praise={line.axis}
              style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}
            >
              <span aria-hidden style={{ color: "#7fe0a0", lineHeight: 1.45 }}>
                ✦
              </span>
              <span style={{ lineHeight: 1.45, minWidth: 0 }}>
                {line.text}
                <span style={{ color: TEXT_DIM }}>（{Math.round(line.score * 100)}%）</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 建議 ── */}
      {model.advice.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {model.advice.map((line) => (
            <div
              key={line.code}
              data-ggd-round-advice={line.axis}
              style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}
            >
              <span aria-hidden style={{ color: GOLD, lineHeight: 1.45 }}>
                ▸
              </span>
              <span style={{ lineHeight: 1.45, minWidth: 0 }}>
                {line.text}
                <span style={{ color: TEXT_DIM }}>（{Math.round(line.score * 100)}%）</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 自己隊伍的成員(和 3D 模型列同一批人) ── */}
      {model.members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.04em" }}>本回合隊伍表現</div>
          {model.members.map((m) => (
            <div
              key={m.seat.seatId}
              data-ggd-round-member={m.seat.seatId}
              style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11 }}
            >
              <span
                style={{
                  color: ROUND_VICTORY_COLOR[m.grade.grade],
                  fontWeight: "bold",
                  width: 14,
                }}
              >
                {m.grade.grade}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: teamCss(m.seat.teamId),
                }}
              >
                {m.seat.displayName}
              </span>
              <span style={{ color: TEXT_DIM, fontVariantNumeric: "tabular-nums" }}>
                {m.seat.roundKills} / {m.seat.roundDeaths}
              </span>
              <span style={{ color: GOLD, fontVariantNumeric: "tabular-nums" }}>+{m.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 團隊累積積分 —— 結算畫面讀的是同一支 teamStandings() ── */}
      <TeamPointsRows standings={standings} localTeamId={localTeamId} roundsSeen={roundsSeen} />
    </div>
  );
}

/**
 * 團隊累積積分的那幾列。**回合畫面與結算畫面共用這一個 component**,所以兩處
 * 印出來的不只是同一個數字,連格式都是同一份 —— 沒有第二個地方可以分岔。
 */
export function TeamPointsRows({
  standings,
  localTeamId,
  roundsSeen,
}: {
  standings: readonly TeamStanding[];
  localTeamId: number | null;
  roundsSeen: number;
}): React.JSX.Element {
  return (
    <div data-ggd-team-points="" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.04em" }}>團隊累積積分</span>
        <span style={{ fontSize: 9, color: TEXT_DIM, marginLeft: "auto" }}>
          {formatLedgerScope(roundsSeen)}
        </span>
      </div>
      {standings.length === 0 ? (
        <div style={{ fontSize: 11, color: TEXT_DIM }}>尚未累積任何回合積分</div>
      ) : (
        standings.map((t, i) => (
          <div
            key={t.teamId}
            data-ggd-team-points-row={t.teamId}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "baseline",
              fontSize: 11,
              fontWeight: t.teamId === localTeamId ? "bold" : "normal",
            }}
          >
            <span style={{ color: TEXT_DIM, width: 16 }}>#{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, color: teamCss(t.teamId) }}>
              隊伍 {t.teamId + 1}
              {t.teamId === localTeamId ? "（你）" : ""}
            </span>
            <span style={{ color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {formatTeamPoints(t.points)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
