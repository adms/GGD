/**
 * G6 + G13 + G9 的**一條**守衛 —— 全部讀最終世界狀態（血條 / 冷卻圈 / 面板護甲），
 * ⛔ 沒有任何一條斷言去問「schema 收不收得下這一格」（那對「欄位開了但 handler
 * 沒接」永遠是綠的）。
 *
 * 三個機制共用同一個夾具英雄，因為它們在同一支英雄身上本來就會同時存在：
 *
 *   G6 —— EX 指名改寫 **Q 的 AP 係數** → 學了 EX 的人打出去的傷害比較高。
 *          對照組是**同一份英雄定義**，唯一差別是沒有 `learnEx()`。
 *   G13 —— ① 天生技是 `innateKind:"active"` 且 `innateActivePassive:"attach"`，
 *          它的 passive 區塊必須真的掛上去（在這一格之前 `syncAbilityPassives`
 *          對主動型天生技無條件 `continue`，那個區塊永遠掛不上）。
 *          ② 【切換】開著的期間護甲上升，關掉之後回到原值。
 *   G9 —— 那個 passive 區塊帶的是 `scopeSlot:"Q"` 的冷卻縮減，所以**同一次施放**
 *          裡 Q 的冷卻圈比 W 短 —— 兩支技能的 `cooldown` 欄位是同一個數字。
 *
 * ⚠️ 沒有任何出貨數值住在這裡（第零守則⑦）：夾具自己造的 `10 秒 / 0.5 / +25 護甲`
 * 只是讓機制可觀測，斷言全部是「A 比 B 多／少」或「回到原值」，⛔ 不問差多少。
 *
 * ── 突變紀錄（真的做過：改壞 → 紅 → 改回來）────────────────────────────────
 *  · `abilitySystem.ts::castAbility` 的
 *      `runEffects(augmentedEffects, …)` → `runEffects(def.effects, …)`
 *    （＝ G6 主動施放那一面整條撤銷）
 *    → 紅（逐字）：
 *      `AssertionError: expected 9.948000000000093 to be greater than 9.948000000000093`
 *      （第一條 it 的 `expect(lost(vAug)).toBeGreaterThan(lost(vPlain))` ——
 *       兩位受害者掉的血變成完全一樣，也就是強化整條沒有發生）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { castAbility, learnEx } from "./abilitySystem";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { EntityId } from "../../ids";
import type { IntentFrame } from "../intents";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const INNATE_ID = "fixture-g6.innate" as AbilityId;
const EX_ID = "fixture-g6.ex" as AbilityId;
const HERO = "fixture-g6-hero" as ChampionId;
const DUMMY = "fixture-g6-dummy" as ChampionId;

/** 主動型天生技（有冷卻的 D 槽），但**同時**帶一份 passive 區塊 —— G13①。 */
const INNATE: AbilityDef = {
  id: INNATE_ID,
  name: "fixture 紮根",
  slot: "PASSIVE",
  innateKind: "active",
  innateActivePassive: "attach",
  castType: "self",
  maxRank: 1,
  cooldown: [1],
  manaCost: [0],
  range: 0,
  effects: [{ kind: "applyBuff", modifiers: [], duration: 1 }],
  // G9 —— 只對 Q 那一格生效的冷卻縮減。⛔ 它不進 `sc.final`。
  passive: {
    ranks: [
      {
        modifiers: [
          { stat: Stat.CooldownReduction, op: ModOp.Flat, value: 0.5, scopeSlot: "Q" },
        ],
      },
    ],
  },
} as unknown as AbilityDef;

/** 強化者：allowlist 的 `damageCoeffAp`，指名 Q。⛔ 不是路徑、不是欄位名。 */
const EX: AbilityDef = {
  id: EX_ID,
  name: "fixture 追加咒印",
  slot: "EX",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  augment: {
    targets: [{ abilityId: `${HERO}.q`, ops: [{ op: "damageCoeffAp", mode: "add", value: 5 }] }],
  },
} as unknown as AbilityDef;

function slotDef(slot: "Q" | "W" | "E", extra: Partial<AbilityDef>): AbilityDef {
  return {
    id: `${HERO}.${slot.toLowerCase()}` as AbilityId,
    name: `fixture ${slot}`,
    slot,
    castType: "self",
    maxRank: 1,
    cooldown: [10],
    manaCost: [0],
    range: 0,
    effects: [],
    recoverySec: 0,
    ...extra,
  } as unknown as AbilityDef;
}

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(INNATE_ID, INNATE);
  Abilities.register(EX_ID, EX);
  registerChampion({
    ...THORNE,
    id: HERO,
    passiveAbility: INNATE_ID,
    exAbility: EX_ID,
    abilities: {
      Q: slotDef("Q", {
        castType: "targeted",
        range: 50,
        effects: [{ kind: "damage", amount: { flat: 10 }, damageType: "true" }],
      }),
      W: slotDef("W", {}),
      E: slotDef("E", {
        cooldown: [0],
        toggle: {
          upkeepCadence: "none",
          upkeepCost: [0],
          onExit: [],
          // G13② —— 開著的期間才有的護甲。
          whileOn: { ranks: [{ modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 25 }] }] },
        },
      }),
      R: slotDef("W", { slot: "R" } as Partial<AbilityDef>),
    },
  } as never);
  registerChampion({ ...THORNE, id: DUMMY });
});

function spawn(world: SimWorld, championId: ChampionId, seat: number, team: number, dx: number) {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 },
    zone: 0,
  });
}

/** 學會 Q/W/E，並給一份 AP 來源（讓 AP 係數的差別看得見）。 */
function ready(world: SimWorld, id: EntityId): void {
  const ab = world.abilities.get(id)!;
  for (const s of ["Q", "W", "E"] as const) ab.slots[s].rank = 1;
  attachSource(world, id, {
    id: "fixture:ap",
    kind: "item",
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 }],
  });
  recomputeStats(world, id);
}

describe("G6 · G13 · G9 —— 強化打得到主動施放、天生技的常駐區塊、只縮一格的冷卻", () => {
  it("學了強化 EX 的人，同一支 Q 打出更多傷害；沒學的同一份英雄打的是原值", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260810);
    const augCaster = spawn(world, HERO, 0, 0, -8);
    const plainCaster = spawn(world, HERO, 1, 0, -4);
    const vAug = spawn(world, DUMMY, 2, 1, 2);
    const vPlain = spawn(world, DUMMY, 3, 1, 6);
    world.rebuildGrid();
    ready(world, augCaster);
    ready(world, plainCaster);
    expect(learnEx(world, augCaster)).toBe(true);

    const before = new Map([vAug, vPlain].map((e) => [e, world.health.get(e)!.hp] as const));
    expect(castAbility(world, augCaster, "Q", { type: "entity", entityId: vAug })).toBe("ok");
    expect(castAbility(world, plainCaster, "Q", { type: "entity", entityId: vPlain })).toBe("ok");
    world.step(NO_INTENTS);

    const lost = (e: EntityId) => before.get(e)! - world.health.get(e)!.hp;
    expect(lost(vPlain)).toBeGreaterThan(0);
    expect(lost(vAug)).toBeGreaterThan(lost(vPlain));
  });

  it("scopeSlot 的冷卻縮減只縮 Q —— 同一次施放裡 W 的冷卻圈比較長", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260810);
    const hero = spawn(world, HERO, 0, 0, -8);
    const victim = spawn(world, DUMMY, 1, 1, 2);
    world.rebuildGrid();
    ready(world, hero);

    expect(castAbility(world, hero, "Q", { type: "entity", entityId: victim })).toBe("ok");
    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");
    const ab = world.abilities.get(hero)!;
    // 兩支技能的 `cooldown` 欄位是同一個數字，唯一的差別是那條 scopeSlot:"Q"。
    // ⚠️ 它同時是 G13① 的守衛：主動型天生技的 passive 區塊掛不上去的話，
    // 這條 modifier 根本不存在，兩格會一樣長。
    expect(ab.slots.W.cooldownRemainingTicks).toBeGreaterThan(0);
    expect(ab.slots.Q.cooldownRemainingTicks).toBeLessThan(ab.slots.W.cooldownRemainingTicks);
    // 而它**沒有**污染全域面板（scoped 的定義）—— 面板讀 `sc.final`。
    expect(world.stats.get(hero)!.final[Stat.CooldownReduction]).toBe(0);
  });

  it("切換開著的期間護甲上升，再按一次關掉之後回到原值", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260810);
    const hero = spawn(world, HERO, 0, 0, -8);
    world.rebuildGrid();
    ready(world, hero);

    const armor = () => {
      recomputeStats(world, hero);
      return world.stats.get(hero)!.final[Stat.Armor];
    };
    const base = armor();
    expect(castAbility(world, hero, "E", { type: "self" })).toBe("ok");
    const on = armor();
    expect(castAbility(world, hero, "E", { type: "self" })).toBe("ok");

    expect(on).toBeGreaterThan(base);
    expect(armor()).toBe(base);
  });
});
