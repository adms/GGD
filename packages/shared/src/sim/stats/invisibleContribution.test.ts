/**
 * 【隱形貢獻】GH#729（接手 #157 ＋ #161）—— 承重守衛。
 *
 * 這三件事在此之前**機制天天在跑，而計分板上一個數字都沒有**：
 *   ① 打守護塔的傷害 —— `recordDamage` 的 `if (!tgtChamp) return;` 早退把它整包丟掉
 *   ② 守護塔的尾刀 —— `payout` 發金幣 + 滿血 + buff，⛔ 沒有人記一筆
 *   ③ 首殺賞金 —— 進了 `goldEarned` 的總數，⛔ 但分不出來是賞金
 *
 * ⭐ 跑的是出貨的那條路：真的 `SimWorld.step` 排掉真的 `damageQueue`、
 *    真的 `guardianSystem` 的 `payout`、真的 `deathSystem` 的賞金分支。
 * ⛔ 不斷言任何一個常數（150 金、40 傷害都是設定值，第二守則）——
 *    斷言的是**這一格有沒有動、而且動在對的那一格上**。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { beginCombatGuardians, type GuardianRules } from "../systems/GuardianSystem";

beforeAll(() => registerSkeletonContent());

const RULES: GuardianRules = {
  hpBase: 300,
  hpGrowthPerRound: 0,
  armor: 0,
  magicResist: 0,
  radius: 2.5,
  maxHitPctMaxHp: 0.15,
  volleyPeriodTicks: 9999,
  volleyWindupTicks: 9999,
  volleyMarks: 0,
  volleyRadius: 0,
  volleyDamageBase: 0,
  volleyDamageGrowthPerRound: 0,
  volleyRampPct: 0,
  volleyRampMax: 1,
  dormancyTicks: 5,
  rewardGold: 150,
  restoreHpPct: 1,
  restoreManaPct: 1,
  buffDurationTicks: 12,
  heirPulsePct: 0,
  heirPulseRadius: 0,
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

describe("結算頁的隱形貢獻 (GH#729)", () => {
  it("打塔的傷害記進 guardianDamage，⛔ 不污染 damageDealt / largestSingleHit", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    const hero = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = [...w.structure.keys()][0]!;

    w.damageQueue.push({ source: hero, target: gid, amount: 30, type: "physical", crit: false, origin: "ability:test" });
    step(w, 2);

    const s = w.matchStats.get(hero)!;
    // ⬇ 把 matchStats.ts 的 `world.structure.has(target)` 那一段拿掉,這一條就紅。
    expect(s.guardianDamage).toBeGreaterThan(0);
    // ⭐ 而且它**沒有**溢出到對人輸出的那兩格（評分讀的是那兩格）。
    expect(s.damageDealt).toBe(0);
    expect(s.largestSingleHit).toBe(0);
  });

  it("守護塔的尾刀記一次；而且它是**付得出去**的那一刀才算", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    const hero = champAt(w, 0, 0, -38, 0);
    beginCombatGuardians(w, RULES, [0], 1);
    const gid = [...w.structure.keys()][0]!;

    w.health.get(gid)!.hp = 1;
    w.damageQueue.push({ source: hero, target: gid, amount: 500, type: "physical", crit: false, origin: "ability:test" });
    step(w, 3);

    const s = w.matchStats.get(hero)!;
    expect(s.guardiansSlain).toBe(1);
    // 塔真的死了、金幣真的進了口袋 —— 這一列的數字與玩家拿到的東西是同一件事。
    expect(w.structure.size).toBe(0);
    expect(s.goldEarned).toBeGreaterThan(0);
  });

  it("首殺賞金貼得出標籤：bountyGold > 0 而且 ≤ goldEarned（⛔ 不是第二次入帳）", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    const killer = champAt(w, 0, 0, -38, 0);
    const victim = champAt(w, 1, 1, -37, 0);
    w.damageQueue.push({ source: killer, target: victim, amount: 99999, type: "physical", crit: false, origin: "ability:test" });
    step(w, 3);

    const s = w.matchStats.get(killer)!;
    expect(w.health.get(victim)!.alive).toBe(false);
    // ⬇ 把 DeathSystem 的 `recordBountyGold(...)` 那一層拿掉,這一條就紅。
    expect(s.bountyGold).toBeGreaterThan(0);
    // ⭐ 它是 `goldEarned` 的**子集**：同一筆錢的標籤,⛔ 不是第二筆收入。
    expect(s.bountyGold).toBeLessThanOrEqual(s.goldEarned);
  });

  it("三個計數器都折進 digest —— 一個只在某一份 replica 上跳的計數器要看得見", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    const hero = champAt(w, 0, 0, -38, 0);
    const before = w.digest();
    w.matchStats.get(hero)!.guardianDamage += 1;
    expect(w.digest()).not.toBe(before);
    const mid = w.digest();
    w.matchStats.get(hero)!.guardiansSlain += 1;
    expect(w.digest()).not.toBe(mid);
    const mid2 = w.digest();
    w.matchStats.get(hero)!.bountyGold += 1;
    expect(w.digest()).not.toBe(mid2);
  });
});
