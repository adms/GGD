/**
 * ⚖️ **系統技能倍率 `abilityDamage`** —— owner 2026-08-23 逐字：「**系統技能倍率設定成 0.3**」。
 *
 * ⭐ 驗**機制**⛔ 不驗數字（第二守則）：ability 起源的封包吃它、basic 不吃。
 * 出貨值 0.3 住 content/config（三住處 + ownerKnobs 在守），⛔ 這裡不抄。
 */
import { describe, expect, it } from "vitest";

import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { combatResolveSystem } from "./damage";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

function world(mult: number): { w: SimWorld; a: EntityId; b: EntityId } {
  registerSkeletonContent();
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatEnv = normalizeCombatEnv({ abilityDamage: mult });
  const a = spawnChampion(w, { championId: "thorne" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: 0, z: 0 }, zone: 0 });
  const b = spawnChampion(w, { championId: "sela" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: 1, z: 0 }, zone: 0 });
  return { w, a, b };
}

/** 打一發,回傳實際掉血。 */
function hit(w: SimWorld, from: EntityId, to: EntityId, origin: string): number {
  const before = w.health.get(to)!.hp;
  w.damageQueue.push({ source: from, target: to, amount: 100, type: "true", crit: false, origin });
  combatResolveSystem(w);
  return before - w.health.get(to)!.hp;
}

describe("abilityDamage 系統技能倍率", () => {
  it("★ ability 起源吃倍率、basic 不吃（機制,⛔ 不驗 0.3 這個數字）", () => {
    const half = world(0.5);
    const abilityDmg = hit(half.w, half.a, half.b, "ability:godie-test.q");
    const basicDmg = hit(half.w, half.a, half.b, "basic");

    // ⚠️ 參照組要**同起源比同起源** —— ability 起源另外吃 AP 乘法層/打感放大,
    //    拿 basic 當 ability 的分母會把那些混進來（第一次就這樣寫錯）。
    const neutral = world(1);
    const abilityRef = hit(neutral.w, neutral.a, neutral.b, "ability:godie-test.q");
    const basicRef = hit(neutral.w, neutral.a, neutral.b, "basic");

    expect(abilityDmg, "技能傷害沒有吃倍率").toBeCloseTo(abilityRef * 0.5, 5);
    expect(basicDmg, "普攻也被砍了 —— 那是 damageDealt 的工作,⛔ 不是這格").toBeCloseTo(basicRef, 5);
  });
});
