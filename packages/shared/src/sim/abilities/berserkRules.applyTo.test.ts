/**
 * GH#305 —— 暴走的血量閘只准鎖住**自我暴走**,不准鎖住【混亂】。
 *
 * ⭐ 兩個方向一起驗:① 滿血對敵人下混亂放得出來(缺陷本身)、② 滿血對自己開
 * 暴走仍然 `"hp-too-high"`(對照組)。⛔ 只驗 ① 的話「把血量閘整個刪掉」也會
 * 全綠(失敗形態④)。
 *
 * ⚠️ def 手寫(混亂那一支還在 owner 手上重製中),形狀逐欄對齊出貨的
 * godie-e00r.ex;走 `castAbility` 的端到端守衛在 `sim/berserkOwnerSpec.test.ts`。
 *
 * 突變紀錄(三條都跑過):受詞判斷改回無條件 `true` → ① 紅;只留
 * `applyTo === "self"` → 第二條 it 紅;血量閘改成一律 `null` → ② 紅。
 */
import { describe, expect, it } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { berserkCastBlock } from "./berserkRules";
import type { AbilityDef } from "../content/defs";
import type { AbilityId, EntityId, StatusId } from "../../ids";

/** 一個滿血的身體。血量閘讀的就只有這一格。 */
function fullHpWorld(): { world: SimWorld; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 305);
  const caster = world.spawn();
  world.health.set(caster, {
    hp: 1000, maxHp: 1000, mana: 500, maxMana: 500, alive: true, shields: [],
  });
  return { world, caster };
}

function def(id: string, over: Partial<AbilityDef>): AbilityDef {
  return {
    id: id as AbilityId,
    name: id,
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [12],
    manaCost: [30],
    range: 0,
    effects: [],
    ...over,
  };
}

/** 12-01 鬥仙術式:對**敵人**下混亂(失控 + 不分敵我)。 */
const CONFUSE_ENEMY = def("test.confuse", {
  castType: "targeted",
  range: 8,
  targetsEnemies: true,
  effects: [
    { kind: "applyStatus", statusId: "confusion" as StatusId, duration: 1,
      berserk: true, targetsAllies: true },
  ],
});

/** 59-001 完全暴走式:對**自己**開暴走。 */
const BERSERK_SELF = def("test.berserk", {
  castType: "self",
  effects: [
    { kind: "applyStatus", statusId: "berserk" as StatusId, duration: 10,
      applyTo: "self", berserk: true },
  ],
});

describe("暴走血量閘的受詞(GH#305)", () => {
  it("⛔ 滿血對敵人下【混亂】放得出來,而滿血對自己開【暴走】仍然放不出來", () => {
    const { world, caster } = fullHpWorld();
    expect(berserkCastBlock(world, CONFUSE_ENEMY, caster)).toBeNull();
    expect(berserkCastBlock(world, BERSERK_SELF, caster)).toBe("hp-too-high");
  });

  it("⛔ 沒寫 applyTo 的自我暴走技(castType:self)也照樣被鎖住", () => {
    const { world, caster } = fullHpWorld();
    const implicit = def("test.berserk.implicit", {
      castType: "self",
      effects: [
        { kind: "applyStatus", statusId: "berserk" as StatusId, duration: 10, berserk: true },
      ],
    });
    expect(berserkCastBlock(world, implicit, caster)).toBe("hp-too-high");
  });
});
