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
 * ── 版位 (#107 安全區契約 → #219) ─────────────────────────────────────────
 * 卡片貼**右側**,中央整條留給 3D 模型列:模型是 owner 點名的主角,一張蓋住
 * 它的卡片會是「做了但玩家看不到」的另一種寫法。
 *
 * ⚠️ 座標**不在這個檔裡**。它是 `hud/hudSurfaces` 註冊表裡的 `round-victory`
 * surface:停在右上角 slot 欄的**內側**(離最寬的那個 slot 一個 HUD_GAP),
 * 起點排在置中欄位堆疊之下。
 *
 * 舊版寫的是 `top: topRightClear({gap:8}); right: 16; width: min(340px,34vw)`
 * ——「讓開常駐 chrome」只讓了**垂直**那一半,水平方向一路貼到螢幕右緣,所以
 * 它同時蓋著 ⚙ 設定與 cheats 兩個 slot;而置中的觀戰橫幅在 ≤ ~1250px 寬的視窗
 * 裡右緣就壓在卡片上,兩邊誰都看不見對方。owner 2026-07-30:「你的競技場已分
 * 出勝負 擋住結算評價」。守衛見 `hud/hudSurfaces.test.ts`。
 *
 * ⚠️ 它**不註冊 HUD slot**。`hudLayout` 的 skipTransient 堆疊尾端是 `fps`,
 * 加一個 order > 1 的非 transient slot 會讓 `hudLayout.test.ts` 掛;而這片卡
 * 只在 `resolution` 出現、不是常駐 chrome,本來就不該進那張表。
 *
 * ── 為什麼分成兩個 component ────────────────────────────────────────────────
 * `RoundVictoryView` 是純 props,所以整張卡在 node env 用 `react-dom/server`
 * 就渲染得出來 —— 每一條斷言都讀**畫面吐出來的字串**,不是模型的回傳值。
 *
 * ⚠️ 但**只渲染 view 不夠**(2026-07-30 量到)。座標是 `RoundVictoryPanel` 用
 * `style=` 餵進去的,所以把下面那一行改成 `style={undefined}` 就能整個撤掉版位
 * 而全套測試照樣綠 —— 這就是第⑤號故障。`hud/hudSurfacePaint.test.ts` 現在**連
 * 這個 component 一起掛**(和 HudRoot 一樣的掛法),讀渲染出來的
 * left/top/width/max-height —— **四個邊都讀**,因為碰撞掃描證明的是四個邊。
 * (`max-height` 在 2026-07-30 之前只檢查「有沒有這個宣告」,把它灌大就能讓盒子
 * 往下長出被證明乾淨的矩形之外。)
 */
import { useEffect, useMemo } from "react";
import { useHud } from "../../net/RoomStore";
import { hudSurfaceStyle } from "../hud/hudSurfaces";
import { useHudSurface } from "../hud/useHudSurface";
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
  // 版位由 #107 surface 註冊表決定(hooks 必須在任何 early-return 之前跑完)
  const surface = useHudSurface("round-victory");

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
        // 上一回合結束時的殭屍累積值(roundVictory §3)。讀的是 `round − 1`
        // 那一格 —— 這一回合自己寫的那一格永遠不會被自己讀到,見
        // {@link mobKillsAtRoundEnd} 的檔頭。沒有前值 → 差為 0,寧可少算
        // 不要把整場的擊殺算成一回合的。
        prevMobKills: roundVictoryBaseline(matchId, round),
      }),
    [matchId, round, localTeamId, localSeatId, outcome, seats],
  );

  // 記帳 + 記水位。兩件事都是冪等的(`record` 以 round 為鍵覆寫,水位以 round
  // 為鍵覆寫成同一份內容),所以 React 重跑這個 effect 幾次都不會讓積分翻倍,
  // 也不會改變這一回合算出來的殭屍差(teamLedger §3)。
  useEffect(() => {
    commitRoundVictory(matchId, round, model, seats);
  }, [matchId, round, model, seats]);

  const standings = teamStandings();
  // #107 / #219: WHERE the card goes is the registry's answer, not this file's.
  // `null` = this viewport has no honest room for it (a 812×375 landscape phone
  // with the centred 觀戰中 pill up), and painting it anyway is exactly the
  // 「擋住結算評價」 the owner reported, mirrored.
  if (!surface) return null;
  return (
    <RoundVictoryView
      model={model}
      standings={standings}
      localTeamId={localTeamId}
      roundsSeen={teamLedger.roundsSeen()}
      style={hudSurfaceStyle("round-victory", surface)}
    />
  );
}

/**
 * 每一回合**結束時**每個座位的 mobKills 水位,以 ROUND 為鍵。
 *
 * 帳本記的是積分不是殭屍數,所以這一份放在模組層 —— 它是同一個生命週期的東西
 * (這一台機器、這一場),而且和帳本一樣**重連就沒了**,理由與代價同
 * teamLedger §3。刻意不塞進 zustand:它不驅動任何 render,塞進 store 只會讓
 * 每個回合多一次全 HUD 重繪。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 為什麼是 `Map<round, …>` 而不是一張扁平的 `Map<seatId, kills>`
 * ═══════════════════════════════════════════════════════════════════════════
 * 扁平版本用**同一格**做「讀上一回合」與「寫這一回合」,而 resolution 相位有
 * 5 秒(`PhaseMachine` 的 `resolutionTicks = 5 × TICK_HZ`),sim 在這 5 秒裡
 * 照樣每 tick 跑 —— 回血、冷卻、狀態計時都在動,所以 `RoomStore` 的 seats
 * 投影(以 JSON 內容當快取鍵)在同一個回合裡一定會換不只一次。於是:
 *
 *   1. 面板第一次算 → 殭屍差 15 → 拿到 A → 記帳 +78 分
 *   2. effect 把「現在的累積值」寫回同一格
 *   3. 任何一個座位欄位一變 → `useMemo` 重算 → 差變成 **0** → 掉成 B →
 *      而 `record` 以 round 為鍵覆寫,所以**那筆 +78 分被改寫成 +57**
 *
 * (A/78 → B/57 是 2026-07-30 把這一支改回讀寫同一格之後量到的,不是估的;
 *  重現方式與完整突變紀錄見 `roundVictoryFeed.test.ts` 的檔頭。)
 *
 * 畫面上等第會在玩家眼前掉一階,團隊累積積分則永遠少算 objective 那一軸,而
 * 且兩者都不會有任何錯誤訊息(形態②:算出來了,但送到畫面上的是另一份)。
 * 根因是 read 與 write 共用一格,所以修法是把水位按回合分開:**讀 `round − 1`、
 * 寫 `round`**,兩者永遠不可能是同一格,重算幾次都收斂到同一個答案。
 */
const mobKillsAtRoundEnd = new Map<number, Record<number, number>>();

/** 這份記憶屬於哪一場。換場整份丟掉,理由同 teamLedger.ensureMatch。 */
let memoryMatchId = "";

/**
 * 這一回合該用的殭屍水位 = **上一回合結束時**的值。
 *
 * 換場 → 空的(新的一場 mobKills 從 0 重數,拿上一場的水位去減會得到負數,
 * 被 `mobKillsDelta` 夾成 0 —— 一個安靜的 0 分)。
 * 沒有上一回合的紀錄(重連、觀戰、面板沒掛上)→ 也是空的,`mobKillsDelta`
 * 因此回 0:寧可少算,不要把整場的擊殺算成一回合的。
 */
export function roundVictoryBaseline(matchId: string, round: number): Record<number, number> {
  if (matchId !== memoryMatchId) return {};
  return mobKillsAtRoundEnd.get(round - 1) ?? {};
}

/**
 * 面板每看到一份 HUD 快照就走這一支:記帳 + 記水位,**順序固定、兩件都冪等**。
 *
 * 水位無論有沒有評分都要記(輪空/觀戰的回合別人照樣在殺殭屍),否則下一回合
 * 讀不到前值,整隊的 objective 軸會憑空歸零。
 */
export function commitRoundVictory(
  matchId: string,
  round: number,
  model: RoundVictoryModel,
  seats: readonly { seatId: number; mobKills?: number }[],
): void {
  if (!Number.isFinite(round) || round <= 0) return;
  if (matchId !== memoryMatchId) {
    memoryMatchId = matchId;
    mobKillsAtRoundEnd.clear();
  }
  if (model.ledgerEntries.length > 0) teamLedger.record(matchId, round, model.ledgerEntries);
  const snap: Record<number, number> = {};
  for (const s of [...seats].sort((a, b) => a.seatId - b.seatId)) {
    snap[s.seatId] = Math.max(0, s.mobKills ?? 0);
  }
  mobKillsAtRoundEnd.set(round, snap);
}

/** 測試用:把 mobKills 的記憶清掉(帳本自己有 `clear`)。 */
export function resetRoundVictoryMemory(): void {
  mobKillsAtRoundEnd.clear();
  memoryMatchId = "";
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
      data-hud-surface="round-victory"
      style={{
        // ⚠️ 這裡**不再有座標**。#107 的 surface 註冊表(hud/hudSurfaces 的
        // `round-victory`)算好矩形,`RoundVictoryPanel` 用 `style` 餵進來。
        //
        // owner 2026-07-30:「你的競技場已分出勝負 擋住結算評價」。舊版寫的是
        // `top: topRightClear({gap:8}); right: 16; width: min(340px,34vw)` ——
        // 量到的是:(a) 它一路貼到螢幕右緣,所以把 ⚙ 設定與 cheats 兩個 slot
        // 蓋掉;(b) 螢幕寬 ≤ ~1250 時,置中的觀戰橫幅右緣就壓在它上面,而兩邊
        // 誰都看不到對方。改成「停在右側 slot 欄的內側」之後,兩件事同時消失,
        // 而且是**幾何上不可能**再發生,不是挪開而已。
        position: "absolute",
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
