/**
 * GH#729 —— 守護塔兩欄與賞金子行**印在結算頁的 markup 裡**。
 *
 * ⚠️ 上一輪（7c6b1953）只驗到 `buildStatBreakdown()` 回傳的陣列裡有那一列，而那
 * 正是**失敗形態⑧**騙得過的形狀：陣列到玩家眼前還隔著兩個出貨 component 與一格
 * 收合開關，「型別上有這個欄位」證明不了「畫面上有那個數字」。
 * ⇒ 這一條渲染**出貨的那兩個 component**（`react-dom/server`，同
 * `settlementTeamLives.test.ts` 的形狀），問的是「label 後面**緊接著**的那一格是
 * 不是這個值」——⛔ 不是「整份 markup 裡某處有 8,210 這個字」。
 *
 * ⭐ 兩個方向都跑（一把只驗過單邊的尺不算自證過）：吃到賞金 ⇒ 金錢那一列長出
 * 「(含賞金 N)」；沒吃到 ⇒ ⛔ 不可以長出「含賞金」，**而守護塔兩列照樣印得出來**
 * —— 後面那半句是這把尺的 calibrate：沒印出來是因為真的沒有，⛔ 不是尺瞎了。
 *
 * ⚠️ 數字全部來自夾具，⛔ 沒有一個出貨值被抄進斷言。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { appStore } from "../platform/store";
import { MatchEndPanel } from "./MatchEndPanel";
import { LeaveSettlementOverlay } from "./LeaveSettlementOverlay";

/** ⚠️ winnerTeam 1、本地座位在隊伍 0 ⇒ 敗仗 ⇒ 卡片不會被烤雞煙火扣住。 */
function arm(over: Partial<PlayerMatchStats>): void {
  const s: MatchSettlement = {
    matchId: "m-729",
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
        stats: { ...createMatchStats(), ...over },
      },
    ],
  };
  // 伺服器 `buildSettlement()` 把 `entry.stats` **整包**丟上線，客戶端重讀的是
  // JSON ⇒ 夾具也走一次往返，否則這條守衛驗不到「它過得了線」。
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

/**
 * markup → 每個標籤變成一個 SEP，於是「這個 label 後面**緊接著**的那一格是不是
 * 這個值」問得出來 —— ⛔ 不是「某處有這個字」，那種問法在一張塞滿數字的計分卡
 * 上幾乎永遠是綠的。
 */
function shows(html: string, label: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${label}${SEP}+${esc}`).test(html.replace(/<[^>]+>/g, SEP));
}

/** 玩家讀得到結算數據的**兩個**畫面：正常結束 · 自己隊伍被淘汰後的退場卡。 */
const PANELS: [string, () => string][] = [
  ["MatchEndPanel", () => renderToStaticMarkup(createElement(MatchEndPanel))],
  ["LeaveSettlementOverlay", () => renderToStaticMarkup(createElement(LeaveSettlementOverlay))],
];

describe("守護塔兩欄與賞金子行印在結算頁上 (GH#729)", () => {
  it("兩個出貨結算畫面都印得出夾具的數字", () => {
    arm({ guardianDamage: 8210, guardiansSlain: 4, goldEarned: 6300, bountyGold: 1750 });
    for (const [name, render] of PANELS) {
      const html = render();
      expect(shows(html, "守護塔輸出", "8,210"), `${name} 沒印出守護塔輸出`).toBe(true);
      expect(shows(html, "守護塔擊破", "4"), `${name} 沒印出守護塔擊破`).toBe(true);
      // 賞金是金錢那一列的**子行** —— ⛔ 不是第二列（它已經含在 goldEarned 裡，
      // 另開一列會讓玩家把同一筆錢加兩次）。
      expect(shows(html, "取得金錢", "6,300 (含賞金 1,750)"), `${name} 沒印出賞金子行`).toBe(true);
    }
  });

  it("⛔ 沒吃到賞金就不長括號 —— 而守護塔兩列照樣印得出來（尺的 calibrate）", () => {
    arm({ guardianDamage: 8210, guardiansSlain: 4, goldEarned: 6300, bountyGold: 0 });
    for (const [name, render] of PANELS) {
      const html = render();
      expect(html, `${name} 在零賞金時仍在說「含賞金」`).not.toContain("含賞金");
      expect(shows(html, "取得金錢", "6,300"), `${name} 沒印出金錢`).toBe(true);
      expect(shows(html, "守護塔輸出", "8,210"), `${name} 這把尺是瞎的`).toBe(true);
    }
  });
});
