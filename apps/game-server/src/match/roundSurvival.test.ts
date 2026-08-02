/**
 * roundSurvival — 存活順序**從真的模擬死亡**推出來的守衛 (GH#257).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼要開一個真的 MatchController,而不是手刻一個名次陣列
 * ═══════════════════════════════════════════════════════════════════════════
 * 失敗形態 ⑤(被測的不是出貨的那個)。「存活順序」這條鏈有四段:
 *
 *   sim 的 death 事件 → MatchController.roundDeathTick → projectSnapshot
 *   → rankSurvival 的名次
 *
 * 只驗最後一段(拿一個手刻的 `roundDeathTick` 餵給 `rankSurvival`)會對
 * 「伺服器根本沒在記」和「記對了」**兩種實作都全綠** —— 那正是 #143 的變身
 * 重建測試踩過的坑(它自己手寫 `e.flags = FORM_A`,而出貨的 snapshot 從不寫它)。
 *
 * 所以這裡真的把三個座位在三個**不同的 tick** 打死,然後從
 * `ctl.roundDeathTick` 和 `projectSnapshot` 讀回來。把 MatchController 那一行
 * `this.roundDeathTick.set(...)` 刪掉,這一支就紅。
 */
import { describe, expect, it } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchState } from "@ggd/shared/protocol/schema";
import { rankSurvival, type SurvivalSeat } from "@ggd/shared/sim/stats/roundSurvival";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { projectSnapshot } from "../net/snapshot";

const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 4000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
  }));

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
}

/**
 * 把一個座位的 HP 歸零,然後跑一個 tick —— DeathSystem 會在那一格把它判死並
 * 發出一個真的 `death` 事件,MatchController 的事件迴圈就是從那裡記 tick 的。
 * 這是「真的死」,不是直接寫 `roundDeathTick`。
 */
function killSeat(ctl: MatchController, seatId: number): void {
  const seat = [...ctl.seats.values()].find((s) => s.seatId === seatId);
  const eid = seat?.entityId;
  if (eid === null || eid === undefined) throw new Error(`seat ${seatId} has no entity`);
  const hp = ctl.world.health.get(eid);
  if (!hp) throw new Error(`seat ${seatId} has no health`);
  hp.hp = 0;
}

/** 場上還活著、而且是同一隊的三個座位 —— 拿來當受害者。 */
function liveSeatsOfSomeTeam(ctl: MatchController): number[] {
  const byTeam = new Map<number, number[]>();
  for (const s of [...ctl.seats.values()].sort((a, b) => a.seatId - b.seatId)) {
    if (s.entityId === null) continue;
    if (!ctl.world.health.get(s.entityId)?.alive) continue;
    const list = byTeam.get(s.teamId) ?? [];
    list.push(s.seatId);
    byTeam.set(s.teamId, list);
  }
  // Map 迭代先排序(硬性約束),然後挑第一個湊得滿三個人的隊
  for (const teamId of [...byTeam.keys()].sort((a, b) => a - b)) {
    const list = byTeam.get(teamId)!;
    if (list.length >= 3) return list.slice(0, 3);
  }
  throw new Error("no team with 3 live seats in combat");
}

function toSurvivalSeats(ctl: MatchController, seatIds: readonly number[]): SurvivalSeat[] {
  return seatIds.map((seatId) => {
    const s = [...ctl.seats.values()].find((x) => x.seatId === seatId)!;
    const alive = s.entityId !== null && ctl.world.health.get(s.entityId)?.alive === true;
    return {
      seatId,
      teamId: s.teamId,
      championId: s.championId ?? `c${seatId}`,
      alive,
      roundKills: ctl.roundKills.get(s.seatId as never) ?? 0,
      roundDeathTick: ctl.roundDeathTick.get(s.seatId as never) ?? 0,
    };
  });
}

describe("MatchController 真的記下每個座位的陣亡 tick", () => {
  it("三個座位在不同 tick 依序倒下 → 名次 1/2/3 是倒序", () => {
    cover("round-survival-real-deaths");
    const ctl = new MatchController("m-surv", 4242, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    const [a, b, c] = liveSeatsOfSomeTeam(ctl);

    // 這一回合開場時,三個人都還沒有陣亡 tick
    expect(ctl.roundDeathTick.get(a as never) ?? 0).toBe(0);

    killSeat(ctl, a!);
    ctl.tick();
    const tA = ctl.roundDeathTick.get(a as never) ?? 0;
    for (let i = 0; i < 5; i++) ctl.tick();
    killSeat(ctl, b!);
    ctl.tick();
    const tB = ctl.roundDeathTick.get(b as never) ?? 0;
    for (let i = 0; i < 5; i++) ctl.tick();
    killSeat(ctl, c!);
    ctl.tick();
    const tC = ctl.roundDeathTick.get(c as never) ?? 0;

    // 真的被記了,而且是遞增的絕對 tick(不是遞減計數器,不是 0)
    expect(tA).toBeGreaterThan(0);
    expect(tB).toBeGreaterThan(tA);
    expect(tC).toBeGreaterThan(tB);

    // 最後倒的 c 是第一名,最先倒的 a 是第三名
    const ranks = rankSurvival(toSurvivalSeats(ctl, [a!, b!, c!]));
    expect(ranks.map((r) => r.seat.seatId)).toEqual([c, b, a]);
    expect(ranks.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it("同一個 tick 一起死 → 平手規則接手,而且不是隨機的", () => {
    cover("round-survival-same-tick-tie");
    const ctl = new MatchController("m-surv-tie", 777, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    const [a, b] = liveSeatsOfSomeTeam(ctl);

    // 同一格把兩個人都歸零 —— DeathSystem 在同一次 step 判掉兩個
    killSeat(ctl, a!);
    killSeat(ctl, b!);
    ctl.tick();

    const tA = ctl.roundDeathTick.get(a as never) ?? 0;
    const tB = ctl.roundDeathTick.get(b as never) ?? 0;
    expect(tA).toBeGreaterThan(0);
    expect(tA).toBe(tB); // 真的是同一個 tick

    // 平手時 seatId 小的在前(擊殺數在這一格通常都是 0),而且**與輸入順序無關**
    const seats = toSurvivalSeats(ctl, [a!, b!]);
    const forward = rankSurvival(seats).map((r) => r.seat.seatId);
    const reversed = rankSurvival([...seats].reverse()).map((r) => r.seat.seatId);
    expect(forward).toEqual(reversed);
    const lo = Math.min(a!, b!);
    // 兩個都 0 殺 → seatId 小的第一;有人有殺數的話擊殺數優先
    const kills = new Map(seats.map((s) => [s.seatId, s.roundKills]));
    const expectedFirst = kills.get(a!) === kills.get(b!) ? lo : forward[0];
    expect(forward[0]).toBe(expectedFirst);
  });

  it("陣亡 tick 真的被投影到快照上(不是只活在伺服器記憶體裡)", () => {
    cover("round-survival-reaches-client");
    const ctl = new MatchController("m-surv-wire", 31337, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    const [a] = liveSeatsOfSomeTeam(ctl);
    killSeat(ctl, a!);
    ctl.tick();

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    let seen: number | null = null;
    state.seats.forEach((ss) => {
      if (ss.seatId === a) seen = ss.roundDeathTick;
    });
    // 失敗形態 ②:算出來了但從沒送到客戶端。這一條就是那個關卡。
    expect(seen).toBe(ctl.roundDeathTick.get(a as never));
    expect(seen).toBeGreaterThan(0);
  });

  it("下一回合開打時陣亡 tick 被清掉(否則上一回合的順序會沿用)", () => {
    cover("round-survival-reset-per-round");
    const ctl = new MatchController("m-surv-reset", 909, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    tickUntil(ctl, "combat");
    const [a] = liveSeatsOfSomeTeam(ctl);
    killSeat(ctl, a!);
    ctl.tick();
    expect(ctl.roundDeathTick.get(a as never) ?? 0).toBeGreaterThan(0);

    // 跑到下一次戰鬥進場
    tickUntil(ctl, "resolution", 20000);
    tickUntil(ctl, "combat", 20000);
    for (const [, v] of [...ctl.roundDeathTick.entries()].sort((x, y) => x[0] - y[0])) {
      expect(v).toBe(0);
    }
  });
});
