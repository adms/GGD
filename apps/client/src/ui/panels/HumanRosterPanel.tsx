/**
 * HumanRosterPanel — 場上的**真人玩家名冊**（GH#492）。
 *
 * owner 2026-08-21 逐字：
 *
 * > 「若有其他玩家一起進入房間遊戲，也請出現**明顯提示姓名與積分、所選英雄**，
 * >  **每回合結算也都要特別再提示一次**，因為**有可能斷線離開或連線回來房間繼續遊戲**」
 *
 * ── 為什麼它不是「一塊漂亮的計分板」 ─────────────────────────────────────
 * owner 自己給了理由，而那個理由決定了這塊面板的形狀：**斷線**。一場比賽裡一個
 * 位子可能在三種狀態之間來回，而其中兩種在畫面上長得一模一樣：
 *
 *   · 真人在打                      → 遊戲中
 *   · 真人斷線，bot 暫時接手         → ⚠️ 斷線 · BOT 接手（重連回來就換回去）
 *   · 天生就是 bot                  → 根本不上這份名冊
 *
 * 中間那一種是這塊面板存在的全部理由：`MatchRoom.onLeave` 在斷線的**當下**就把
 * driver 換成 AI、`sessionId` 清成 null，所以「他還在不在」只有伺服器知道。
 * 判斷寫在 `platform/lobbyRally.ts` 的 `seatPresence()`（純函式，node 可測），
 * ⛔ 這個檔案不重寫一份。
 *
 * ── 為什麼它掛在**兩個**相位而不是常駐 ──────────────────────────────────
 * 常駐會和 `Scoreboard` / `EnemyTeamPanel` 打架，而且戰鬥中沒有人在讀名字。
 * owner 指名的兩個時機正好是玩家會抬頭的兩刻：**進場**（選角）與**每回合結算**。
 * 兩者都是 `config.lobby-rally@1` 的一格開關（`rosterShows()`），⛔ 不是這裡的
 * 一串 `phase ===` 字面值。
 *
 * ── 版面 ────────────────────────────────────────────────────────────────
 * 右上角、`INTERMISSION_Z.panel` 這一帶：和商店卡同一層，所以三選一的 focus scrim
 * 會照樣把它壓下去（它是可瀏覽的資訊，⛔ 不是要蓋過抉擇的東西）。它不佔
 * `hudLayout` 的插槽 —— 只在兩個相位出現的東西不該長期預約角落空間。
 */
import { useHud } from "../../net/RoomStore";
import { championDisplayFor } from "../platform/championDisplay";
import {
  PRESENCE_LABEL,
  activeLobbyRally,
  rosterRows,
  rosterShows,
  type RosterRow,
} from "../platform/lobbyRally";
import { INTERMISSION_Z } from "./intermissionLayout";
import { GOLD, PANEL_BG, PANEL_BORDER, TEAM_CSS, TEXT_DIM, TEXT_MAIN } from "../theme";

/** 斷線那一列的顏色 —— ⚠️ 它要跟「正常」看得出差別，這是整塊面板的重點。 */
const OFFLINE = "#e0a13a";

function RosterLine(props: { row: RosterRow }): React.JSX.Element {
  const { row } = props;
  const champ = row.championId ? championDisplayFor(row.championId).name : "未選角";
  const teamColor = TEAM_CSS[row.teamId % TEAM_CSS.length];
  const offline = row.presence === "bot-holding";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "3px 0",
        borderLeft: `3px solid ${teamColor}`,
        paddingLeft: 8,
        opacity: offline ? 0.85 : 1,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: row.isSelf ? 800 : 600,
          color: row.isSelf ? GOLD : TEXT_MAIN,
          maxWidth: 132,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={row.displayName}
      >
        {row.displayName}
        {row.isSelf ? "（你）" : ""}
      </span>
      {/* 積分。⛔ 0 不畫成「0 分」—— 那會讓一個平台沒給分的座位看起來像個很弱的
          真人。缺席就不出現，那才是「不知道」的誠實樣子。 */}
      {(row.rating ?? 0) > 0 && (
        <span style={{ fontSize: 11, color: TEXT_DIM }} title="積分（MMR）">
          {row.rating}
        </span>
      )}
      <span style={{ fontSize: 12, color: TEXT_MAIN, marginLeft: "auto" }}>{champ}</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: offline ? OFFLINE : TEXT_DIM,
          whiteSpace: "nowrap",
        }}
      >
        {PRESENCE_LABEL[row.presence]}
      </span>
    </div>
  );
}

export function HumanRosterPanel(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);

  const policy = activeLobbyRally();
  const rows = rosterRows(seats, localSeatId);
  // ⚠️ 數的是「這個位子屬於真人」的列數,⛔ 不是「現在連著的人」—— 不然一個玩家
  // 斷線的瞬間整塊面板就自己消失,而那正是最需要它的時候。
  if (!rosterShows(policy, phase, rows.length)) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        right: 12,
        zIndex: INTERMISSION_Z.panel,
        width: 300,
        maxWidth: "44vw",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        padding: "8px 10px 9px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1,
          color: GOLD,
          marginBottom: 5,
        }}
      >
        真人玩家 {rows.length}
      </div>
      {rows.map((row) => (
        <RosterLine key={row.seatId} row={row} />
      ))}
      {rows.some((r) => r.presence === "bot-holding") && (
        <div style={{ fontSize: 10, color: OFFLINE, marginTop: 5, paddingLeft: 11 }}>
          ⚠️ 斷線的位子由 BOT 暫時接手，連線回來就會拿回控制權
        </div>
      )}
    </div>
  );
}
