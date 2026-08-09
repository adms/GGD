/**
 * GH#296 小怪的【死亡時】真的執行得到，而英雄那一半沒被弄壞。⭐ 兩條都跑**完整的
 * `step()`**：缺陷全部就是一個 slot 順序 —— `mobSystem`(9d′) 就地 `destroy()` →
 * `stats.delete()` → `worldHookSystem`(9f) 派發時 `fireHooks` 在**缺 stats 那一行**
 * 就 return（不是 #293 的存活閘）。⛔ 斷言讀**效果的結果**不是「`emit` 被呼叫過」。
 * ⚠️ 夾具替小怪手寫 `StatsComp` 是刻意的（出貨殭屍沒屬性表，owner 裁決，
 * `mobs.statusVsStats.test.ts` ② 在守）—— 這裡釘的是**機制**。
 * 突變：`destroyAfterHooks` 改回 `destroy` → ① FAIL、② 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { spawnMob, type MobRules } from "../mobs";
import { attachSource } from "../stats/statPipeline";
import { zeroStats } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";
import type { EffectDef } from "../effects/effect";
import type { HookDef } from "../stats/modifiers";

const TAG = "mob-death-hook";
const MARK = "test-死亡時" as StatusId;
/** 「我死的時候在殺我的人身上蓋個記號」。記號沒有雜訊（不必跟回血比大小）。 */
const CARD: HookDef = {
  on: "onDeath",
  effects: [{ kind: "applyStatus", statusId: MARK, duration: 30 } as unknown as EffectDef],
} as HookDef;
/** 最小殭屍波設定 —— `boss/special: null` 讓 `spawnMob` 一顆 rng 都不抽。 */
const RULES: MobRules = {
  fromRound: 3, firstWaveTicks: 1, waveIntervalTicks: 100000, mobsPerWaveCap: 1,
  maxAlivePerZone: 8, level: 3, maxHp: 400, moveSpeed: 5, hpRegenPerSec: 0,
  modelKey: "mob-test", sizeMult: 1, tintStrength: 0, attackDamage: 20,
  attackRangeSq: 1.8 * 1.8, attackCdTicks: 3, radius: 0.6, rewardGold: 1,
  rewardXp: 1, killsPerLevel: 0, boss: null, special: null,
};
const C = SKELETON_ARENA.zones[0]!.center;
beforeAll(() => registerSkeletonContent());
const hero = (w: SimWorld, seat: number, team: number): EntityId =>
  spawnChampion(w, { championId: SELA.id, seatId: asSeatId(seat), teamId: asTeamId(team),
    pos: { x: C.x + seat * 2, z: C.z }, zone: 0 });
/** 打死 `victim`，跑完一整個出貨 tick，回傳 `killer` 身上的記號。 */
function slay(w: SimWorld, killer: EntityId, victim: EntityId): string[] {
  w.damageQueue.push({ source: killer, target: victim, amount: 999999, type: "true", crit: false, origin: "basic" });
  w.step(new Map());
  return (w.status.get(killer)?.effects ?? []).map((e) => String(e.statusId));
}
function stage(): { w: SimWorld; killer: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  w.mobRules = RULES;
  w.mobTicks = 0;
  return { w, killer: hero(w, 0, 0) };
}

describe("GH#296 死亡時 hook (mob-death-hook)", () => {
  it("★ ① 小怪死掉時，掛在牠身上的【死亡時】真的執行", () => {
    cover(TAG);
    const { w, killer } = stage();
    const mob = spawnMob(w, 0, RULES, 1, 0);
    w.stats.set(mob, { championId: "mob-probe" as ChampionId, final: zeroStats(),
      dirty: false, sources: [{ id: "test:deathrattle", kind: "passive", hooks: [CARD] }] });
    expect(slay(w, killer, mob), "屍體在派發前就被銷毀了 —— hook 缺 stats 直接 return").toContain(MARK);
    expect(w.mob.has(mob), "延後銷毀變成不銷毀了：屍體活過了這個 tick").toBe(false);
  });

  it("★ ② 反向：英雄的【死亡時】仍然發得出去（#293 沒被弄壞）", () => {
    cover(TAG);
    const { w, killer } = stage();
    const victim = hero(w, 1, 1);
    attachSource(w, victim, { id: "test:deathrattle", kind: "item", hooks: [CARD] });
    expect(slay(w, killer, victim)).toContain(MARK);
  });
});
