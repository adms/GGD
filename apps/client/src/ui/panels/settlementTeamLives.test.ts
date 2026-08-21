/**
 * GH#126 —— 團隊生命值印在**結算卡裡面**。
 *
 * 缺陷（票逐字回查）：伺服器那半早就落地，客戶端那半一行沒動 —— `lives` 在整個
 * 客戶端只被 `settlementModel` 裡**未匯出**的 `compareTeamStanding()` 當排序鍵讀，
 * **拿來排序 ≠ 畫在畫面上**。而 commit 97944609「取消淘汰」之後 `finalStandings()`
 * 正是拿 teamHealth 遞減決定全場 2/3/4 名 ⇒ 生命值就是「你為什麼是第 3 名」的
 * 唯一解釋，卻在唯一會看名次的畫面上缺席。
 *
 * ⭐ 為什麼只能由 `MatchEndPanel` 自己印（而不是把 bar 叫回來）：這個檔案第二條
 * 就在證明它 —— `match-end` panel 宣告 `covers` 四個角落，所以結算時
 * `TeamLivesBar` 不是「被蓋掉」，是 `return null`，**根本沒進 DOM**。
 *
 * ⚠️ 渲染出貨的那個 component（失敗形態⑤），⛔ 不是掃原始碼字串（形態⑥）：
 * 「有沒有印出來」的答案只在 markup 裡。這一包的 vitest 是 `environment: "node"`，
 * 所以走 `react-dom/server`，同 `hud/hudSurfacePaint.test.ts`。
 * ⚠️ 數字全部來自**夾具**，⛔ 沒有一個出貨值被抄進斷言。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import { hudStore, resetHudStore, type TeamView } from "../../net/RoomStore";
import { TeamLivesBar } from "../components/TeamLivesBar";
import { MatchEndPanel } from "./MatchEndPanel";
import { settlementTeamLives } from "./settlementModel";

/** ⚠️ winnerTeam 1、本地座位在隊伍 0 ⇒ 敗仗 ⇒ 卡片不會被烤雞煙火扣住。 */
const SETTLEMENT: MatchSettlement = {
  matchId: "m-team-lives",
  winnerTeam: 1,
  perPlayer: [0, 1].map((seatId) => ({
    seatId,
    accountId: `acc-${seatId}`,
    champ: "godie-ogrh",
    teamId: seatId,
    role: "fighter",
    grade: "B" as const,
    rank: seatId === 0 ? 2 : 1,
    stats: createMatchStats(),
  })),
};

/** 刻意亂序，而且刻意用不會撞到別的欄位的數字。 */
const TEAMS: TeamView[] = [
  { teamId: 0, lives: 7, eliminated: false, placement: 0, roundOutcome: 0 },
  { teamId: 1, lives: 19, eliminated: false, placement: 0, roundOutcome: 0 },
  { teamId: 2, lives: 0, eliminated: true, placement: 4, roundOutcome: 0 },
];

function arm(): void {
  hudStore.setState({ connected: true, phase: "matchEnd", localSeatId: 0, settlement: SETTLEMENT, teams: TEAMS });
}

afterEach(() => resetHudStore());

describe("結算畫面的團隊生命值 (GH#126)", () => {
  it("三隊的生命值都印在結算卡上，名次順序與 settlementTeamLives 一致", () => {
    arm();
    const html = renderToStaticMarkup(createElement(MatchEndPanel));
    expect(html, "結算卡沒有團隊生命值區塊").toContain("團隊生命值");
    // 逐隊都要有自己的列（⛔ 不是「畫面上某處有 19 這個字」）
    const rows = [...html.matchAll(/data-ggd-team-lives-row="(\d+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(settlementTeamLives(TEAMS).map((t) => String(t.teamId)));
    // 而且真的印出**夾具的數字**：19 生命的隊排第一，0 生命的隊照樣印 0
    for (const t of TEAMS) {
      const cell = html.slice(html.indexOf(`data-ggd-team-lives-row="${t.teamId}"`));
      expect(cell.slice(0, cell.indexOf("</div></div>")), `隊伍 ${t.teamId} 的生命值沒印出來`).toContain(
        `>${t.lives}<`,
      );
    }
  });

  it("⛔ 而 TeamLivesBar 在結算時根本不進 DOM —— 這就是上面那條非做不可的原因", () => {
    arm();
    expect(renderToStaticMarkup(createElement(TeamLivesBar))).toBe("");
  });
});
