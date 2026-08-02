/**
 * roundSurvival — 存活名次的規則守衛 (GH#257).
 *
 * 這一支只驗**純規則**;「真的死亡事件會不會變成名次」由
 * `apps/game-server/src/match/roundSurvival.test.ts` 用一個真的 MatchController
 * 驅動(失敗形態 ⑤:不要在測試裡手刻名次陣列然後測 UI)。
 */
import { describe, expect, it } from "vitest";
import { cover } from "../../../testkit/cover";
import {
  compareSurvival,
  rankSurvival,
  survivalTier,
  SURVIVAL_TIER,
  type SurvivalSeat,
} from "./roundSurvival";

function seat(o: Partial<SurvivalSeat> & { seatId: number }): SurvivalSeat {
  return {
    teamId: 0,
    championId: `c${o.seatId}`,
    alive: false,
    roundKills: 0,
    roundDeathTick: 0,
    ...o,
  };
}

describe("三個階層", () => {
  it("活著 > 倒下過 > 從來沒上場(輪空/停在場邊)", () => {
    cover("survival-tiers");
    expect(survivalTier(seat({ seatId: 0, alive: true }))).toBe(SURVIVAL_TIER.SURVIVED);
    expect(survivalTier(seat({ seatId: 1, roundDeathTick: 42 }))).toBe(SURVIVAL_TIER.ELIMINATED);
    // #173 的那一格:輪空隊伍每個座位都是 alive:false 且從來沒發過 death 事件。
    expect(survivalTier(seat({ seatId: 2 }))).toBe(SURVIVAL_TIER.ABSENT);
  });

  it("輪空的座位排在**倒下過的人後面**,不是和他們混在一起", () => {
    cover("survival-bye-last");
    const bye = seat({ seatId: 0 });
    const diedEarly = seat({ seatId: 9, roundDeathTick: 1 });
    // 倒在第 1 tick 的人仍然贏過一個根本沒上場的座位
    expect(compareSurvival(diedEarly, bye)).toBeLessThan(0);
  });
});

describe("倒得越晚,名次越前面", () => {
  it("三個座位依序倒下 → 名次 1/2/3 是倒序", () => {
    cover("survival-order-basic");
    const ranks = rankSurvival([
      seat({ seatId: 0, roundDeathTick: 100 }), // 第一個倒 → 第三名
      seat({ seatId: 1, roundDeathTick: 300 }), // 最後倒 → 第一名
      seat({ seatId: 2, roundDeathTick: 200 }),
    ]);
    expect(ranks.map((r) => r.seat.seatId)).toEqual([1, 2, 0]);
    expect(ranks.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it("站到最後的人贏過任何倒過的人,不管他倒得多晚", () => {
    cover("survival-alive-beats-late-death");
    const ranks = rankSurvival([
      seat({ seatId: 0, roundDeathTick: 99999 }),
      seat({ seatId: 1, alive: true }),
    ]);
    expect(ranks[0]!.seat.seatId).toBe(1);
  });

  it("復活後再倒下的人用**後面**那一次的 tick(呼叫端覆寫,不是取第一次)", () => {
    cover("survival-revive-latest-death");
    // #84 復活圈:seat 0 在 t=50 倒過、被拉起來、t=400 才真的離場。
    // 記錄端(MatchController)覆寫成 400,所以他贏過 t=200 才倒的 seat 1。
    const ranks = rankSurvival([
      seat({ seatId: 0, roundDeathTick: 400 }),
      seat({ seatId: 1, roundDeathTick: 200 }),
    ]);
    expect(ranks[0]!.seat.seatId).toBe(0);
  });
});

describe("平手規則 —— 明說,不靠迭代順序", () => {
  it("同一個 tick 死亡 → 先比擊殺數", () => {
    cover("survival-tie-kills");
    const ranks = rankSurvival([
      seat({ seatId: 0, roundDeathTick: 500, roundKills: 1 }),
      seat({ seatId: 1, roundDeathTick: 500, roundKills: 4 }),
    ]);
    expect(ranks.map((r) => r.seat.seatId)).toEqual([1, 0]);
  });

  it("同 tick 又同擊殺數 → seatId 小的在前(最終仲裁,永遠分得出來)", () => {
    cover("survival-tie-seatid");
    const ranks = rankSurvival([
      seat({ seatId: 7, roundDeathTick: 500, roundKills: 2 }),
      seat({ seatId: 3, roundDeathTick: 500, roundKills: 2 }),
    ]);
    expect(ranks.map((r) => r.seat.seatId)).toEqual([3, 7]);
  });

  it("全隊都活著(誰都沒倒)也有一個決定性的順序", () => {
    cover("survival-all-alive-deterministic");
    const seats = [
      seat({ seatId: 5, alive: true, roundKills: 2 }),
      seat({ seatId: 1, alive: true, roundKills: 2 }),
      seat({ seatId: 9, alive: true, roundKills: 3 }),
    ];
    const a = rankSurvival(seats).map((r) => r.seat.seatId);
    // 輸入順序打亂,結果必須一模一樣 —— 這正是「不依賴 Map 迭代順序」的意思
    const b = rankSurvival([...seats].reverse()).map((r) => r.seat.seatId);
    expect(a).toEqual([9, 1, 5]);
    expect(b).toEqual(a);
  });
});

describe("排序不改動輸入", () => {
  it("呼叫端拿到的那一份陣列不會被就地排序", () => {
    cover("survival-no-mutate");
    const seats = [seat({ seatId: 0, roundDeathTick: 1 }), seat({ seatId: 1, roundDeathTick: 9 })];
    const before = seats.map((s) => s.seatId);
    rankSurvival(seats);
    expect(seats.map((s) => s.seatId)).toEqual(before);
  });
});
