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
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { Stat } from "./statTypes";
import { baseBonusFor } from "../baseBonus";
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

/** 生一個英雄，回這個世界與它。 */
function spawn(championId: ChampionId, env: Partial<Record<CombatEnvKey, number>>): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatEnv = normalizeCombatEnv(env);
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  return { world, id };
}

/** 生一個英雄，回它算完的那條屬性。 */
function statOf(championId: ChampionId, stat: Stat, env: Partial<Record<CombatEnvKey, number>>): number {
  const { world, id } = spawn(championId, env);
  return world.stats.get(id)!.final[stat] as number;
}

/**
 * 同上，但**扣掉基礎加成的贈禮**，也就是這條屬性在**倍率空間**裡的值。
 *
 * ⚠️ 倍率的比值只在倍率空間裡成立：`finalizeStat` 是
 * `(倍率鏈) + 贈禮`，贈禮加在**外面**，所以把它留在分子分母裡的話
 * `both / plain` 會隨著**另一頁**的一格漂。owner 2026-08-23 把
 * `content/config/base-bonus.json` 的 `mr` 從 0 開到 25（「初始魔抗+20%」），
 * 當天這兩條就用「魔抗倍率沒疊上去」這個**錯誤的訊息**紅了 —— 而倍率一直是對的。
 *
 * ⛔ 贈禮**讀世界自己那張表**，不抄字面值也不抄第二份常數。
 * ⚠️ 移速的贈禮是 0，所以移速那幾條用 `statOf` 或這一支逐位元相同。
 */
function multSpaceOf(championId: ChampionId, stat: Stat, env: Partial<Record<CombatEnvKey, number>>): number {
  const { world, id } = spawn(championId, env);
  return (world.stats.get(id)!.final[stat] as number) - baseBonusFor(world.baseBonus, stat);
}

describe("近戰/遠程移速倍率 + 魔抗專屬倍率 (owner 2026-08-10)", () => {
  it("同一個近戰實體：moveSpeedMelee 換一個夾具值，最終移速跟著換", () => {
    cover("combat-env-attack-type-move-speed");
    // ⚠️ 夾具值要讓**兩端都落在移速的夾限帶內**（下界 2、上界 = stat-caps 的
    //    `ms.base`，owner 2026-08-12 定 10）。原本的 0.5/1.5 在上界從 14 收到 10
    //    之後，`fast` 會被夾住，比值就不再是 3 —— 而那時候紅的訊息會說
    //    「倍率沒接上」，實際上倍率好好的，是天花板在說話。0.4/1.2 同樣是 3 倍。
    const slow = statOf(MELEE, Stat.MoveSpeed, { moveSpeedMelee: 0.4 });
    const fast = statOf(MELEE, Stat.MoveSpeed, { moveSpeedMelee: 1.2 });
    expect(fast).toBeGreaterThan(slow);
    // 是**乘**進去的，不是加一個常數：1.5/0.5 = 3 倍。
    expect(fast / slow).toBeCloseTo(3, 10);
  });

  it("同一份 env、同一張卡：近戰與遠程算出不同的移速（依實體而定真的接上了）", () => {
    cover("combat-env-attack-type-move-speed");
    const e = { moveSpeedMelee: 1.2, moveSpeedRanged: 0.4 }; // 同上：兩端都要在夾限帶內
    const melee = statOf(MELEE, Stat.MoveSpeed, e);
    const ranged = statOf(RANGED, Stat.MoveSpeed, e);
    expect(melee).toBeGreaterThan(ranged);
    // 兩邊各自吃自己那一格，所以差距就是兩個夾具值的比。
    expect(melee / ranged).toBeCloseTo(3, 10);
  });

  it("magicResistMult 疊在 defense 之上（相乘，不是取代）", () => {
    cover("combat-env-magic-resist-mult");
    const plain = multSpaceOf(MELEE, Stat.MagicResist, {});
    const both = multSpaceOf(MELEE, Stat.MagicResist, { defense: 2, magicResistMult: 3 });
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
    expect(
      multSpaceOf(MELEE, Stat.MagicResist, old) / multSpaceOf(MELEE, Stat.MagicResist, {}),
    ).toBeCloseTo(2, 10);
  });
});
