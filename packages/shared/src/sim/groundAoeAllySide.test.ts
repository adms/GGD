/**
 * GH#458 —— `castType: "ground"` 從開站起就寫死 `enemiesInCircle`，從來沒讀過
 * `def.targetsEnemies`（隔壁 `"targeted"` 分支兩個方向都擋）。於是 53-03 破法對咒
 *（`content/abilities/godie-o00l.e.json`：`ground` + `targetsEnemies:false` +
 * 單顆 `shield`）把魔法護盾**掛到敵人身上** —— 一支叫「破法」的技能按下去是幫
 * 對面擋魔法，而全套測試是綠的。
 *
 * ⚠️ 兩個呼叫端都驗：`castAbility`（cast-BEGIN，瞬發）與 `CastResolveSystem`
 * （吟唱結束的重新查詢）。只修一邊 = 有吟唱的與沒吟唱的行為不同，看起來像隨機故障。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-o00l.e.json`
 *   · `content/abilities/godie-o00l.e.json` 是 **tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh tiers:apply`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     apply_tiers.py 只重算**五級距那幾格**(damageTier/flat · cooldownTier · manaCostTier ·
 *     radiusTier · rangeTier),並把 MIRRORED 欄位**單向**鏡射進 content/champions/ 的內嵌副本;
 *     其餘欄位是**原封寫回** ⇒ 那些手改會留下來 —— ⛔ 但那是繞過隔離區的手改,仍然要走 genrun。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Abilities } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

/** 53-03 的形狀：地面指定 + 友方 + 一顆護盾。 */
function registerWard(id: string, castTimeSec: number): void {
  Abilities.register(id as AbilityId, {
    id: id as AbilityId,
    name: "Test Ward",
    slot: "E",
    castType: "ground",
    maxRank: 1,
    cooldown: [0.1],
    manaCost: [0],
    range: 12,
    radius: 6,
    targetsEnemies: false,
    castTimeSec,
    effects: [{ kind: "shield", amount: { flat: 500 }, duration: 10 }],
  });
}

beforeAll(() => {
  registerSkeletonContent();
  registerWard("test.wardnow", 0);
  registerWard("test.wardslow", 0.35);
});

/** 三個人全部站在同一顆 6 半徑的圓裡：施法者、隊友、敵人。 */
function setup(abilityId: string) {
  const world = new SimWorld(SKELETON_ARENA, 21);
  const c = SKELETON_ARENA.zones[0]!.center;
  const spawn = (champ: string, seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: champ as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: c.x + dx, z: c.z },
      zone: 0,
    });
  const caster = spawn("sela", 0, 0, 0);
  const ally = spawn("sela", 1, 0, 2);
  const foe = spawn("thorne", 2, 1, -2);
  world.abilities.get(caster)!.slots.E = {
    abilityId: abilityId as AbilityId,
    rank: 1,
    cooldownRemainingTicks: 0,
  };
  world.rebuildGrid();
  return { world, caster, ally, foe, point: { x: c.x, z: c.z } };
}

const pools = (w: SimWorld, id: EntityId): number => w.health.get(id)!.shields.length;

describe("GH#458 targetsEnemies:false 的地面 AoE 罩的是自己這一邊", () => {
  it("瞬發（castAbility）：護盾在隊友與施法者身上，敵人一片都沒有", () => {
    const { world, caster, ally, foe, point } = setup("test.wardnow");
    expect(castAbility(world, caster, "E", { type: "point", point })).toBe("ok");
    expect([pools(world, ally), pools(world, caster), pools(world, foe)]).toEqual([1, 1, 0]);
  });

  it("有吟唱（CastResolveSystem 的重新查詢）：同一個答案", () => {
    const { world, caster, ally, foe, point } = setup("test.wardslow");
    expect(castAbility(world, caster, "E", { type: "point", point })).toBe("ok");
    expect(pools(world, ally)).toBe(0); // 還在吟唱，什麼都還沒發生
    for (let k = 0; k < 20; k++) world.step(new Map());
    expect([pools(world, ally), pools(world, caster), pools(world, foe)]).toEqual([1, 1, 0]);
  });
});
