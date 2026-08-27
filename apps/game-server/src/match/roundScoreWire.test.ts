/**
 * 【回合分數與排名即時上線路】GH#737 —— 承重守衛（伺服器那一半）。
 *
 * > owner（#14 原引）：「進入戰鬥房間，**隨時顯示**玩家自己回合累積分數及排名，
 * >  **回合結束提示排名變化**」
 *
 * 這張票的整個病理是「畫面上的數字與結算頁的數字來自**兩個式子**」——
 * `ui/panels/teamLedger.ts` 的檔頭自陳「因為線上沒有這個數字」所以它自算一份。
 * ⇒ 這一支問的只有一件事：**線上送出去的 `score` 是不是 `rankScore` 這個式子
 *   本身的輸出**（同一支 import，⛔ 不是一個長得像的第二份算法）。
 *
 * ⛔ 不斷言任何一個分數的**值**（那是設定與戰況的函數，第二守則）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { rankScore, perMatchRanks, type RankEntry } from "@ggd/shared/sim/stats/rating";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { MatchController, LIVE_SCORE_PERIOD_TICKS, type SeatSpec } from "./MatchController";

const CFG = { champSelectTicks: 5, intermissionTicks: 20, combatMaxTicks: 100_000, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toCombat(seed: number): MatchController {
  const ctl = new MatchController("rs", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

/** 第一回合的 `RankEntry`：`roundsSurvived` 還是 0（還沒有任何回合結算過）。 */
function entriesNow(ctl: MatchController): RankEntry[] {
  const out: RankEntry[] = [];
  for (const seat of ctl.seats.values()) {
    if (seat.entityId === null) continue;
    out.push({
      stats: ctl.world.matchStats.get(seat.entityId) ?? createMatchStats(),
      role: Champions.tryGet(seat.championId as ChampionId)?.role ?? "fighter",
      roundsSurvived: 0,
    });
  }
  return out;
}

describe("回合分數與排名走上線路 (GH#737)", () => {
  it("⭐ 戰鬥中定期送出一則，而 `score` 就是 `rankScore` 的輸出", () => {
    cover("round-score-wire");
    const ctl = toCombat(2468);
    ctl.takeRoundSettlements(); // 丟掉進場那一則，量的是「戰鬥中還會再送」
    for (let i = 0; i <= LIVE_SCORE_PERIOD_TICKS; i++) ctl.tick();

    const [msg] = ctl.takeRoundSettlements();
    // ⬇ 把 advancePhase 的 `queueRoundScores(false)` 那一行拿掉，這一行就紅。
    expect(msg, "戰鬥中沒有任何一則即時分數 ⇒ HUD 只能自己算一份").toBeDefined();
    expect(msg!.final, "戰鬥中的取樣不是回合結算").toBe(false);
    expect(msg!.players.length).toBe(ctl.seats.size);

    const entries = entriesNow(ctl);
    const lobby = entries.map((e) => e.stats);
    const ranks = perMatchRanks(entries);
    msg!.players.forEach((p, i) => {
      expect(p.score, `座位 ${p.seatId} 的分數不是結算公式的輸出`).toBe(rankScore(entries[i]!, lobby));
      expect(p.rank).toBe(ranks[i]!);
      // 「排名變化」是回合與回合之間的事 —— 每秒抖一次的箭頭沒有意義。
      expect(p.prevRank).toBeUndefined();
    });
  });

  it("回合結算時送出 `final` 的那一則（排名變化提示接在它上面）", () => {
    cover("round-score-wire");
    const ctl = toCombat(1357);
    for (const p of ctl.pairings) {
      for (const seat of ctl.seats.values()) {
        if (seat.teamId !== p.sideB || seat.entityId === null) continue;
        const hp = ctl.world.health.get(seat.entityId);
        if (hp && ctl.world.transform.get(seat.entityId)?.zone === p.zone) {
          hp.alive = false;
          hp.hp = 0;
        }
      }
    }
    ctl.takeRoundSettlements();
    ctl.tick(); // 每一區都分出勝負 → concludeCombat → queueRoundScores(true)

    const [msg] = ctl.takeRoundSettlements();
    expect(msg?.final, "回合結算沒有送出 final 那一則 ⇒ 排名變化提示永遠沒有觸發點").toBe(true);
    expect(msg!.round).toBeGreaterThan(0);
    // 第一回合沒有「上一次」⇒ 留白（⛔ 不是 0：0 會被畫成「從第 0 名掉下來」）。
    expect(msg!.players.every((p) => p.prevRank === undefined)).toBe(true);
  });
});
