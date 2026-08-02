/**
 * GH#257 的**最後一哩**:`SeatState.roundDeathTick` → `SeatView.roundDeathTick`.
 *
 * ⚠️ 失敗形態 ②「算出來了但玩家沒拿到」。這條鏈的其他每一段都有守衛:
 *
 *   伺服器把死亡 tick 記進 SeatState  ← game-server/src/match/roundSurvival.test.ts
 *   名次規則(存活順序 / 三個階層)    ← shared/sim/stats/roundSurvival.test.ts
 *   選擇器 + 皇冠 + 舞台              ← client/src/render/roundPodium.test.ts
 *   出貨呼叫端(hudStore → 舞台)      ← client/src/render/roundWinnerPlan.test.ts
 *   ────────────────────────────────
 *   **`syncHudFromState` 把它從 MatchState 抄進 SeatView** ← 沒有人守
 *
 * 稽核時把 `RoomStore.ts` 那一行 `roundDeathTick: ss.roundDeathTick ?? 0,` 刪掉,
 * **3353 條 client 測試全綠**。而症狀是這個專案最貴的一種:畫面上三個模型還在、
 * 三頂皇冠還在、沒有任何錯誤 —— 只是名次**靜默退化**成改動前的擊殺數排序,
 * 因為 `victoryPodium.toSurvivalSeat` 的 `?? 0` 會把「缺席」讀成「這一回合沒倒過」,
 * 於是全員平手、落到 `roundKills` 那一層仲裁。沒有人看得出來。
 *
 * 所以這一支斷言的是**頒獎台真的排得出存活順序**,不是「store 裡有一個數字」
 * (失敗形態 ⑦:掃屬性代替掃行為)。資料刻意做成存活順序與擊殺數順序完全相反。
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, syncHudFromState } from "./RoomStore";
import { roundVictoryPodium } from "../ui/panels/victoryPodium";

/** Structural stand-in for one reflected Colyseus SeatState. */
function seatState(o: {
  seatId: number;
  teamId: number;
  championId: string;
  roundDeathTick: number;
  roundKills: number;
}) {
  return {
    accountId: `acct-${o.seatId}`,
    seatId: o.seatId,
    teamId: o.teamId,
    displayName: `p${o.seatId}`,
    connected: true,
    driver: "human",
    championId: o.championId,
    entityId: 0, // no live entity → alive:false, which is what a dead seat reads as
    level: 1,
    gold: 0,
    xp: 0,
    ready: true,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [],
    cooldowns: [],
    exAbilityId: "",
    exRank: 0,
    exCooldown: 0,
    passiveCooldown: 0,
    statStacks: 0,
    statCapstonePct: 0,
    attrBonus: [],
    statusIds: [],
    statusRemainTicks: [],
    undoDepth: 0,
    roundKills: o.roundKills,
    roundDeaths: 1,
    coinsLeft: 0,
    mobKills: 0,
    offers: [],
    roundDeathTick: o.roundDeathTick,
  };
}

/**
 * 勝方 team 0 的存活順序是 c-late > c-mid > c-early;**擊殺數剛好相反**。
 * 抄漏 `roundDeathTick` 的實作會給出 c-early / c-mid / c-late。
 */
function fakeState(): MatchState {
  const seats = new Map<string, ReturnType<typeof seatState>>();
  for (const s of [
    seatState({ seatId: 0, teamId: 0, championId: "c-early", roundDeathTick: 100, roundKills: 9 }),
    seatState({ seatId: 1, teamId: 0, championId: "c-mid", roundDeathTick: 500, roundKills: 4 }),
    seatState({ seatId: 2, teamId: 0, championId: "c-late", roundDeathTick: 900, roundKills: 0 }),
    seatState({ seatId: 3, teamId: 1, championId: "e-a", roundDeathTick: 40, roundKills: 0 }),
    seatState({ seatId: 4, teamId: 1, championId: "e-b", roundDeathTick: 60, roundKills: 0 }),
  ]) {
    seats.set(String(s.seatId), s);
  }
  return {
    matchId: "m_podium",
    phase: "resolution",
    round: 4,
    tick: 950,
    phaseTicksLeft: 90,
    seed: 1,
    combatEnvJson: "",
    baseBonusJson: "",
    statCapsJson: "",
    mobVisualJson: "",
    fireRingTicks: 0,
    fireRingRadius: 0,
    seats,
    entities: new Map(),
    teams: [
      { teamId: 0, lives: 3, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.WON },
      { teamId: 1, lives: 1, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.LOST },
    ],
  } as unknown as MatchState;
}

beforeEach(() => resetHudStore());

describe("roundDeathTick 從 MatchState 走進 SeatView (round-deathtick-hud-wire)", () => {
  it("頒獎台照存活順序排 —— 抄漏那一格就會退回擊殺數排序", () => {
    syncHudFromState(fakeState(), "acct-0");
    const { seats, teams } = hudStore.getState();
    const podium = roundVictoryPodium(seats, teams);
    expect(podium.map((p) => p.championId)).toEqual(["c-late", "c-mid", "c-early"]);
    expect(podium.map((p) => p.medal)).toEqual(["gold", "silver", "bronze"]);
    // 退化後的那個答案,明寫出來當反向斷言:
    expect(podium.map((p) => p.championId)).not.toEqual(["c-early", "c-mid", "c-late"]);
  });

  it("每個座位帶著自己的那一格,不是只有金冠那位", () => {
    syncHudFromState(fakeState(), "acct-0");
    const byChamp = Object.fromEntries(
      hudStore.getState().seats.map((s) => [s.championId, s.roundDeathTick]),
    );
    expect(byChamp).toEqual({
      "c-early": 100,
      "c-mid": 500,
      "c-late": 900,
      "e-a": 40,
      "e-b": 60,
    });
  });

  it("pre-#257 的伺服器(沒有這一格)讀成 0 =「這一回合沒倒過」,不是 NaN", () => {
    const state = fakeState();
    state.seats.forEach((ss) => {
      delete (ss as unknown as Record<string, unknown>).roundDeathTick;
    });
    syncHudFromState(state, "acct-0");
    const seats = hudStore.getState().seats;
    expect(seats.every((s) => s.roundDeathTick === 0)).toBe(true);
    // 而且退化的是**順序**,不是「舞台變空的」—— 三位還是站得出來。
    expect(roundVictoryPodium(seats, hudStore.getState().teams)).toHaveLength(3);
  });
});
