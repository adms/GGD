/**
 * 2026-08-10 owner ×3 —— `moveSpeedMelee` / `moveSpeedRanged` / `magicResistMult`
 * 的**機制**守衛：一條屬性現在可以吃第二個倍率，而其中一個取決於**這個實體是誰**。
 *
 * ⚠️ 這裡一個出貨數值都沒有（0.8 / 0.6 / 0.2 全部不在斷言裡）。出貨值住在
 * `content/config/combat-env.json`，抄進測試就是第四個住處。夾具值是刻意挑的
 * 假數字，斷言問的是「乘進去了沒有」與「是乘不是取代」。
 *
 * ⚠️ 兩個受測實體是**同一張卡**只改 `attackType` —— 骨架的 SELA(6.6)/THORNE(6.9)
 * 移速本來就不一樣，拿它們對比的話「近戰跟遠程不同」對**壞掉的實作也會綠**
 * （失敗形態 ④）。
 *
 * 路徑刻意走 `spawnChampion → recomputeStats → finalizeStat`，不是直接呼叫
 * `finalizeStat` 自己塞 subject：出貨那條路上「身分從哪來」正是要守的接線
 * （失敗形態 ⑤）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄（真的跑過：改壞 → 紅 → 改回 → 綠）
 * ════════════════════════════════════════════════════════════════════════════
 *   · `stats/statPipeline.ts` 拿掉 `finalizeStat` 的 `subject: envSubject`
 *       → 「近戰與遠程的最終移速不同」與「同一實體換夾具值會變」兩條同時紅
 *         （倍率整格靜默退回中性 1）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../../ids";
import { Stat } from "./statTypes";
import { normalizeCombatEnv, defaultForKey, type CombatEnvKey } from "../combatEnv";

const Z0 = SKELETON_ARENA.zones[0]!;
/** 同一張卡的兩個複本，**只差** attackType —— 其餘全部逐欄相同。 */
const MELEE = "probe.at.melee" as ChampionId;
const RANGED = "probe.at.ranged" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
  registerChampion({ ...THORNE, id: MELEE, attackType: "melee" });
  registerChampion({ ...THORNE, id: RANGED, attackType: "ranged" });
});

/** 生一個英雄，回它算完的那條屬性。 */
function statOf(championId: ChampionId, stat: Stat, env: Partial<Record<CombatEnvKey, number>>): number {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatEnv = normalizeCombatEnv(env);
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  return world.stats.get(id)!.final[stat] as number;
}

describe("近戰/遠程移速倍率 + 魔抗專屬倍率 (owner 2026-08-10)", () => {
  it("同一個近戰實體：moveSpeedMelee 換一個夾具值，最終移速跟著換", () => {
    cover("combat-env-attack-type-move-speed");
    const slow = statOf(MELEE, Stat.MoveSpeed, { moveSpeedMelee: 0.5 });
    const fast = statOf(MELEE, Stat.MoveSpeed, { moveSpeedMelee: 1.5 });
    expect(fast).toBeGreaterThan(slow);
    // 是**乘**進去的，不是加一個常數：1.5/0.5 = 3 倍。
    expect(fast / slow).toBeCloseTo(3, 10);
  });

  it("同一份 env、同一張卡：近戰與遠程算出不同的移速（依實體而定真的接上了）", () => {
    cover("combat-env-attack-type-move-speed");
    const e = { moveSpeedMelee: 1.5, moveSpeedRanged: 0.5 };
    const melee = statOf(MELEE, Stat.MoveSpeed, e);
    const ranged = statOf(RANGED, Stat.MoveSpeed, e);
    expect(melee).toBeGreaterThan(ranged);
    // 兩邊各自吃自己那一格，所以差距就是兩個夾具值的比。
    expect(melee / ranged).toBeCloseTo(3, 10);
  });

  it("magicResistMult 疊在 defense 之上（相乘，不是取代）", () => {
    cover("combat-env-magic-resist-mult");
    const plain = statOf(MELEE, Stat.MagicResist, {});
    const both = statOf(MELEE, Stat.MagicResist, { defense: 2, magicResistMult: 3 });
    // 取代的話會是 3×；只吃 defense 的話會是 2×。乘積才是 6×。
    expect(both / plain).toBeCloseTo(6, 10);
  });

  it("三格缺席 ⇒ 跟今天逐字相同（缺席一律 1.0，出貨值不住在 shared）", () => {
    cover("combat-env-attack-type-move-speed");
    for (const k of ["moveSpeedMelee", "moveSpeedRanged", "magicResistMult"] as const) {
      expect(defaultForKey(k)).toBe(1);
    }
    // 一份沒有這三格的舊 config：攻擊型態不可以動到移速，`defense` 仍然是魔抗
    // 唯一的倍率。這一條是硬要求 —— 如果誰把 0.8/0.6/0.2 寫進 shared 的預設，
    // 兩個斷言都會紅。
    const old = { defense: 2 };
    expect(statOf(MELEE, Stat.MoveSpeed, old)).toBe(statOf(RANGED, Stat.MoveSpeed, old));
    expect(statOf(MELEE, Stat.MagicResist, old) / statOf(MELEE, Stat.MagicResist, {})).toBeCloseTo(2, 10);
  });
});
