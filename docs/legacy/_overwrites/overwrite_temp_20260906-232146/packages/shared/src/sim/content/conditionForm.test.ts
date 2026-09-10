/**
 * GH#1070 —— `form` 條件葉（「主體現在是本體／變身態」）的承重守衛。
 *
 * ⭐ 跑的是**出貨的** 09-04 龜派氣功：出貨內容、出貨的 `castAbility`、出貨的 09-03
 * 超級賽亞人（`championForm` 效果 → `applyChampionForm`）、出貨的 `revertToBaseForm`。
 * ⛔ 沒有一條斷言在讀 condition 物件的形狀（失敗形態⑦）。
 *
 * **三個方向一起讀**：本體那一發沒有變身增幅 → 變身態那一發有 → **變回本體同一 tick**
 * 又沒有。第三段正是 `recentCast withinSec=變身秒數` 那個代替品做不到的（E 剛放過，
 * 窗口還開著）—— 這一檔在舊內容上是紅的，⛔ 不只是「新葉子會動」。
 *
 * ⛔ 沒有出貨數值住在這裡：法強是這一檔自己掛上去的夾具（level 1 的 AP 是多少與這一檔
 * 無關），tick 數從 `world.dt` 推導，增幅係數只問「有／沒有」。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * `sim/content/condition.ts` 的 `form` 分支改成 `return true;`：
 *   × ①「變身態 > 本體」  FAIL（本體那一發也吃到增幅 ⇒ 兩發一樣大）
 *   × ②「本體不成立」     FAIL（期望 false 得到 true）
 * 改回來 → 全綠。
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
import { asSeatId, asTeamId, type CastTarget, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
/** 09-04 龜派氣功住在 R、09-03 超級賽亞人（變身）住在 E。 */
const GOKU = "godie-o00x" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;
const FORWARD: CastTarget = { type: "dir", dir: { x: 1, z: 0 } };
const ALT: EffectCondition = { kind: "form", subject: "self", form: "alternate" };
const BASE: EffectCondition = { kind: "form", subject: "self", form: "base" };

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 悟空 ＋ 正前方 5 格的敵人（龜派 length 14 / width 2 的線上）。E、R 學到 1 級。 */
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
  // 夾具：法強與法力池，讓 ratio 量得出來、R（144 法力）按得下去。⛔ 不是出貨值。
  attachSource(world, hero, {
    id: "test:ap", kind: "buff",
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 }, { stat: Stat.MaxMana, op: ModOp.Flat, value: 1000 }],
  });
  world.step(new Map());
  return { world, hero, enemy };
}

/** 施放一格並把世界推到它落地，回傳那一發打在 enemy 身上的傷害（出貨的 `damage` 事件）。 */
function castAndMeasure(world: SimWorld, hero: EntityId, enemy: EntityId, slot: "E" | "R", target: CastTarget): number {
  const ab = world.abilities.get(hero)!;
  ab.slots[slot].cooldownRemainingTicks = 0;
  const h = world.health.get(hero)!;
  h.mana = h.maxMana;
  const eh = world.health.get(enemy)!;
  eh.hp = eh.maxHp;
  expect(castAbility(world, hero, slot, target), `${slot} 按不下去`).toBe("ok");
  for (let i = 0; i < Math.round(4 / world.dt); i++) {
    world.step(new Map());
    const hit = world.events.find(
      (e) => e.type === "damage" && e.data["target"] === enemy && String(e.data["origin"]).endsWith(`.${slot.toLowerCase()}`),
    );
    if (hit) return hit.data["amount"] as number;
  }
  throw new Error(`${slot} 在 4 秒內沒有打到 enemy`);
}

describe("GH#1070 form 葉 —— 出貨 09-04 龜派氣功的變身增幅", () => {
  it("① 本體沒有增幅 → 變身態有 → ⭐ 變回本體同一 tick 又沒有（recentCast 的尾巴消失）", () => {
    const { world, hero, enemy } = stage();
    const base = castAndMeasure(world, hero, enemy, "R", FORWARD);
    // 09-03 超級賽亞人：出貨的 targeted 變身技 ⇒ 效果執行器 → applyChampionForm。
    castAndMeasure(world, hero, enemy, "E", { type: "entity", entityId: enemy });
    expect(championFormIndex(world, hero), "E 落地後應該已經是變身態").toBe(1);
    const alt = castAndMeasure(world, hero, enemy, "R", FORWARD);
    revertToBaseForm(world, hero);
    const back = castAndMeasure(world, hero, enemy, "R", FORWARD);
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
    expect(evaluateCondition(world, { ...ALT, subject: "target" }, { self: hero }), "沒有目標 ⇒ 不成立（DECISION 2）").toBe(false);
  });

  it("③ Zod：收 base／alternate；拒絕 any 與從 recentCast 抄來的 withinSec", () => {
    expect(zEffectCondition.safeParse(ALT).success).toBe(true);
    expect(zEffectCondition.safeParse(BASE).success).toBe(true);
    expect(zEffectCondition.safeParse({ ...ALT, form: "any" }).success, "any 是一條永遠成立的葉子").toBe(false);
    expect(zEffectCondition.safeParse({ ...ALT, withinSec: 8 }).success, "strict：多一格就紅").toBe(false);
  });
});
