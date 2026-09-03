/**
 * GH#973 —— 「殭屍擊殺」印在**出貨的結算 markup** 裡。
 *
 * ⚠️ `settlementColumns.test.ts`（game-server 側，跑真的比賽）已經證明
 * `buildStatBreakdown()` **回傳的陣列**裡有這一列而且數字對得上伺服器。
 * ⛔ 而那正是**失敗形態⑧**騙得過的形狀 —— 陣列到玩家眼前還隔著兩個出貨
 * component；隔壁 `guardianSettlementRows.test.ts` 的檔頭逐字記著同一族的前科。
 * ⇒ 這一條渲染**出貨的那兩個 component**，問「label 後面**緊接著**的那一格」。
 *
 * ⭐ 兩個方向都跑（一把只驗過單邊的尺不算自證過）：
 *   ① 封包帶了 `rounds` ⇒ 那一列印得出來，而且是**每回合差值的總和**；
 *   ② 封包沒帶 `rounds`（舊伺服器）⇒ ⛔ **不可以**出現「殭屍擊殺」，
 *      ⭐ 而其餘欄位照樣印得出來 —— 後面那半句是這把尺的 calibrate。
 *
 * ⚠️ 數字全部來自夾具，⛔ 沒有一個出貨值被抄進斷言。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement, RoundStatDelta } from "@ggd/shared/protocol/messages";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { appStore } from "../platform/store";
import { MatchEndPanel } from "./MatchEndPanel";
import { LeaveSettlementOverlay } from "./LeaveSettlementOverlay";

const delta = (mobKills: number): RoundStatDelta => ({
  seatId: 0,
  hpRatio: 1,
  kills: 0,
  deaths: 0,
  assists: 0,
  damageDealt: 0,
  damageTaken: 0,
  damageBlocked: 0,
  healingDone: 0,
  ccAppliedTicks: 0,
  timeAliveTicks: 0,
  revivesPerformed: 0,
  mobKills,
  bye: false,
});

/** ⚠️ winnerTeam 1、本地座位在隊伍 0 ⇒ 敗仗 ⇒ 卡片不會被烤雞煙火扣住。 */
function arm(perRoundMobKills: number[] | null): void {
  const s: MatchSettlement = {
    matchId: "m-973",
    winnerTeam: 1,
    perPlayer: [
      {
        seatId: 0,
        accountId: "acc-0",
        champ: "godie-ogrh",
        teamId: 0,
        role: "fighter",
        grade: "B",
        rank: 2,
        stats: { ...createMatchStats(), damageDealt: 4321 },
      },
    ],
    ...(perRoundMobKills
      ? { rounds: perRoundMobKills.map((n, i) => ({ round: i + 1, players: [delta(n)] })) }
      : {}),
  };
  // 伺服器把整包丟上線、客戶端重讀的是 JSON ⇒ 夾具也走一次往返。
  hudStore.setState({
    connected: true,
    phase: "matchEnd",
    localSeatId: 0,
    settlement: JSON.parse(JSON.stringify(s)) as MatchSettlement,
  });
  appStore.setState({ leaveGate: true }); // 淘汰退場那一張讀的是同一份
}

afterEach(() => {
  resetHudStore();
  appStore.setState({ leaveGate: false });
});

/** 標籤的替身。⛔ 不寫成字面控制字元（編輯它的工具會把它吃掉）。 */
const SEP = String.fromCharCode(1);

/** 「這個 label 後面**緊接著**的那一格是不是這個值」——⛔ 不是「某處有這個字」。 */
function shows(html: string, label: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${label}${SEP}+${esc}`).test(html.replace(/<[^>]+>/g, SEP));
}

const PANELS: [string, () => string][] = [
  ["MatchEndPanel", () => renderToStaticMarkup(createElement(MatchEndPanel))],
  ["LeaveSettlementOverlay", () => renderToStaticMarkup(createElement(LeaveSettlementOverlay))],
];

describe("殭屍擊殺印在結算頁上 (GH#973)", () => {
  it("帶了 rounds ⇒ 兩個出貨結算畫面都印出**每回合差值的總和**", () => {
    arm([12, 30, 5]); // Σ = 47
    for (const [name, render] of PANELS) {
      const html = render();
      expect(shows(html, "殭屍擊殺", "47"), `${name} 沒印出殭屍擊殺`).toBe(true);
    }
  });

  it("⛔ 舊伺服器沒帶 rounds ⇒ 不印那一列（⛔ 不是印 0），而其餘欄位照樣印得出來", () => {
    arm(null);
    for (const [name, render] of PANELS) {
      const html = render();
      expect(html, `${name} 在沒有資料時憑空生出了殭屍擊殺`).not.toContain("殭屍擊殺");
      // 尺的 calibrate：沒印出來是因為真的沒有，⛔ 不是這張卡整個沒渲染。
      expect(shows(html, "傷害輸出", "4,321"), `${name} 這把尺是瞎的`).toBe(true);
    }
  });
});
