/**
 * ⭐⭐ 第十一回合**真的會結束，而且只結算一次**（GH#1151 A 第 4 條）。
 *
 * ⛔⛔ 票逐字警告過的那個坑：「全滅判定的分母是**存活的英雄**，⛔ 不是實體數 ——
 * **屍體都變成王了**」。⭐ 這一支的第二條就是那個坑的守衛：
 * 換邊打開之後，⛔ 一具滿血的王**不可以**讓這一局永遠開著。
 */
import { describe, it, expect } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { TICK_HZ } from "@ggd/shared/constants";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const DURATION = 8;
const rules = (over: Partial<ArenaRules["round11"]> = {}): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: DURATION,
    maxAliveZombies: 0,
    spawnRampSec: 0,
    deadPlayersControlBoss: false,
    waveTable: { eventIntervalSec: 0, difficultyBase: 1, baseSpawnCount: 0, events: [] },
    bombardment: { ...DEFAULT_ARENA_RULES.round11.bombardment, enabled: false },
    ...over,
  },
});

const make = (id: string, over: Partial<ArenaRules["round11"]> = {}) =>
  new MatchController(id, 7, allBots(), FAST, undefined, rules(over));

function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

/** ⭐ 把某一隊的英雄全部打死（⛔ 不移除實體 —— 屍體要留在原地）。 */
function wipeTeam(ctl: MatchController, team: number): void {
  for (const [, seat] of ctl.seats) {
    if ((seat.teamId as unknown as number) !== team || seat.entityId === null) continue;
    const hp = ctl.world.health.get(seat.entityId);
    if (!hp) continue;
    hp.hp = 0;
    hp.alive = false;
  }
}

describe("第十一回合的結束（GH#1151 A 第 4 條）", () => {
  it("⭐ 時間到 ⇒ 這一局結束，⛔ 而且**只結算一次**", () => {
    const ctl = make("end-time");
    toRound11(ctl);
    let n = 0;
    while (ctl.phase.phase === "combat" && n++ < 40000) ctl.tick();
    expect(ctl.phase.phase, "⭐ 戰鬥階段真的離開了").not.toBe("combat");
    // ⭐ 只結算一次：贏家記下來之後就不會再變。
    const first = ctl.phase.round;
    let m = 0;
    while (ctl.phase.phase !== "matchEnd" && m++ < 40000) ctl.tick();
    expect(ctl.phase.round, "⛔ 沒有第 5 個回合").toBe(first);
  });

  it("⛔⛔ 換邊打開 ⇒ 滿血的王**不會**讓這一局永遠開著（⭐ 分母是英雄）", () => {
    // ⚠️⭐ 這一條就是票警告的那個坑:王的實體活著、血是滿的,
    //   ⛔ 而「還有幾個活著的英雄」必須把牠算成 0。
    const ctl = make("end-possess", { deadPlayersControlBoss: true });
    toRound11(ctl);
    for (const team of [0, 1, 2, 3]) wipeTeam(ctl, team);
    ctl.tick(); // ⭐ 這一 tick 全部換邊 ⇒ 四具滿血的王站在場上
    expect(ctl.round11PossessionsForTest.size, "⭐ 真的有王站起來").toBeGreaterThan(0);
    let n = 0;
    // ⭐ 給它遠少於 durationSec 的時間 —— ⛔ 撐過去就代表它是靠計時器才結束的。
    const budget = Math.round((DURATION / 2) * TICK_HZ);
    while (ctl.phase.phase === "combat" && n++ < budget) ctl.tick();
    expect(ctl.phase.phase, "⭐ 活著的英雄歸零 ⇒ 立刻結束（⛔ 不是等計時器）").not.toBe("combat");
  });

  it("⭐ 沒有人死 ⇒ 這一局**在時間到之前⛔ 不會結束**（⛔ 不是「最後一隊站著」）", () => {
    const ctl = make("end-noearly");
    toRound11(ctl);
    // ⭐ 只跑一半的時間,⛔ 而 royale 的「最後一隊站著」在這裡不可以提前收掉它。
    for (let i = 0; i < Math.round((DURATION / 2) * TICK_HZ); i++) ctl.tick();
    expect(ctl.phase.phase, "⛔ 還沒到時間就結束 = 生存局被當成淘汰局收掉了").toBe("combat");
  });
});
