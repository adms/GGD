/**
 * GH#1070 —— `form` 條件葉（「主體現在是本體／變身態」）的承重守衛：**出貨的** 09-04 龜派氣功、
 * 出貨的 `castAbility`／09-03 超級賽亞人（→ `applyChampionForm`）／`revertToBaseForm`。三個方向：
 * 本體沒有變身增幅 → 變身態有 → **變回本體同一 tick** 又沒有（第三段正是 `recentCast withinSec` 做不到的）。
 * ⛔ 沒有出貨數值住在這裡：法強是夾具、tick 數從 `world.dt` 推導、係數只問「有／沒有」。
 * 突變紀錄：`form` 分支改 `return true;` ⇒ ①（兩發一樣大）與 ②（本體期望 false）紅；改回來全綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { shippedContentSource } from "../../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./registry";
import { zEffectCondition } from "../../content/schema/condition";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { applyChampionForm, championFormIndex, revertToBaseForm } from "../systems/ChampionFormSystem";
import { attachSource } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { evaluateCondition, type EffectCondition } from "./condition";
import type { CastTarget } from "../intents";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
/** 09 悟空的**本體**（`transform.role:"base"`）：R 是龜派氣功、E 是超級賽亞人（變身 → `godie-o00x`）。 */
const GOKU = "godie-ogrh" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;
const FORWARD: CastTarget = { type: "dir", dir: { x: 1, z: 0 } };
const ALT: EffectCondition = { kind: "form", subject: "self", form: "alternate" };
const BASE: EffectCondition = { kind: "form", subject: "self", form: "base" };

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 悟空 ＋ 正前方 5 格的敵人（龜派 length 14 / width 2 的線上）。E、R 學到 1 級；法強／法力池是夾具。 */
function stage(): { world: SimWorld; hero: EntityId; enemy: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1070);
  world.combatActive = true;
  const mk = (dx: number, seat: number): EntityId =>
    spawnChampion(world, { championId: GOKU, seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: C.x + dx, z: C.z }, zone: 0 });
  const hero = mk(0, 0);
  const enemy = mk(5, 1);
  const ab = world.abilities.get(hero)!;
  ab.slots.E.rank = 1;
  ab.slots.R.rank = 1;
  const modifiers = [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 }, { stat: Stat.MaxMana, op: ModOp.Flat, value: 1000 }];
  attachSource(world, hero, { id: "test:ap", kind: "buff", modifiers });
  world.step(new Map());
  return { world, hero, enemy };
}

/** 按下一格並把世界推到 `done` 成立（吟唱長度由出貨值決定；4 秒上限由 `dt` 推導）。 */
function castUntil(world: SimWorld, hero: EntityId, slot: "E" | "R", target: CastTarget, done: () => boolean): void {
  const ab = world.abilities.get(hero)!;
  ab.slots[slot].cooldownRemainingTicks = 0;
  const h = world.health.get(hero)!;
  h.mana = h.maxMana;
  expect(castAbility(world, hero, slot, target), `${slot} 按不下去`).toBe("ok");
  for (let i = 0; i < Math.round(4 / world.dt); i++) {
    world.step(new Map());
    if (done()) return;
  }
  throw new Error(`${slot} 在 4 秒內沒有落地`);
}

/** 施放 R，回傳那一發打在 enemy 身上的傷害（出貨的 `damage` 事件，⛔ 不是自己算的）。 */
function castR(world: SimWorld, hero: EntityId, enemy: EntityId): number {
  const eh = world.health.get(enemy)!;
  eh.hp = eh.maxHp;
  let amount: number | undefined;
  castUntil(world, hero, "R", FORWARD, () => {
    const hit = world.events.find((e) => e.type === "damage" && e.data["target"] === enemy && String(e.data["origin"]).endsWith(".r"));
    if (hit) amount = hit.data["amount"] as number;
    return amount !== undefined;
  });
  return amount!;
}

describe("GH#1070 form 葉 —— 出貨 09-04 龜派氣功的變身增幅", () => {
  it("① 本體沒有增幅 → 變身態有 → ⭐ 變回本體同一 tick 又沒有（recentCast 的尾巴消失）", () => {
    const { world, hero, enemy } = stage();
    const base = castR(world, hero, enemy);
    castUntil(world, hero, "E", { type: "self" }, () => championFormIndex(world, hero) === 1); // 09-03 → applyChampionForm
    const alt = castR(world, hero, enemy);
    revertToBaseForm(world, hero);
    const back = castR(world, hero, enemy);
    expect(alt, "變身態那一發沒有比本體大 —— 0.8×AP 的 form ratio 沒有生效").toBeGreaterThan(base);
    expect(back, "變回本體後仍吃到增幅 —— 那正是 recentCast withinSec 的尾巴").toBeCloseTo(base, 6);
  });

  it("② 求值器兩個方向：本體 ⇒ alternate 假／base 真；applyChampionForm 之後翻面；沒有目標 ⇒ 假", () => {
    const { world, hero } = stage();
    expect(evaluateCondition(world, ALT, { self: hero })).toBe(false);
    expect(evaluateCondition(world, BASE, { self: hero })).toBe(true);
    expect(applyChampionForm(world, hero, "alternate", 8, { origin: "test" })).toBe(true);
    expect(evaluateCondition(world, ALT, { self: hero })).toBe(true);
    expect(evaluateCondition(world, BASE, { self: hero })).toBe(false);
    expect(evaluateCondition(world, { ...ALT, subject: "target" }, { self: hero }), "沒有目標 ⇒ 不成立").toBe(false);
  });

  it("③ Zod：收 base／alternate；拒絕 any 與從 recentCast 抄來的 withinSec", () => {
    expect(zEffectCondition.safeParse(ALT).success).toBe(true);
    expect(zEffectCondition.safeParse(BASE).success).toBe(true);
    expect(zEffectCondition.safeParse({ ...ALT, form: "any" }).success, "any 是一條永遠成立的葉子").toBe(false);
    expect(zEffectCondition.safeParse({ ...ALT, withinSec: 8 }).success, "strict：多一格就紅").toBe(false);
  });
});
