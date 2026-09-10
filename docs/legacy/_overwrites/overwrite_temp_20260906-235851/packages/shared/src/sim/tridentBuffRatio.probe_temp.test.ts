/**
 * ⚠️ 暫存探針（GH#1082，⛔ 不出貨、跑完就刪）：證明 `tridentBuffRatio.test.ts` 的 ② 在
 * 11-00 三刀流帶 `statusId` 之後**會綠** —— 這裡在記憶體裡替出貨的兩份 passive 補上 statusId
 * （＝ scratchpad 那份 patch 落地後的形狀），⛔ 不碰磁碟上柵欄外的檔。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { hasStatus } from "./effects/effectCommon";
import type { EffectDef } from "./effects/effect";
import type { CastTarget } from "./intents";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type StatusId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const ZORO = "godie-udre" as ChampionId;
const SID = "three-sword-style" as StatusId;
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  for (const id of ["godie-udre.passive", "godie-u01u.passive"] as AbilityId[]) {
    const b = Abilities.get(id).effects.find((e) => e.kind === "applyBuff") as Extract<EffectDef, { kind: "applyBuff" }>;
    (b as { statusId?: StatusId }).statusId = SID;
  }
});

function stage(): { world: SimWorld; hero: EntityId; enemy: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1082);
  world.combatActive = true;
  const mk = (dx: number, seat: number): EntityId =>
    spawnChampion(world, { championId: ZORO, seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: C.x + dx, z: C.z }, zone: 0 });
  const hero = mk(0, 0);
  const enemy = mk(3, 1);
  world.abilities.get(hero)!.slots.E.rank = 1;
  const modifiers = [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 }, { stat: Stat.MaxMana, op: ModOp.Flat, value: 1000 }];
  attachSource(world, hero, { id: "test:ap", kind: "buff", modifiers });
  world.step(new Map());
  return { world, hero, enemy };
}
function tick(world: SimWorld, hero: EntityId): void {
  world.step(new Map());
  const h = world.health.get(hero)!;
  h.hp = h.maxHp;
}
function castUntil(world: SimWorld, hero: EntityId, slot: "E" | "PASSIVE", target: CastTarget, done: () => boolean): void {
  const ab = world.abilities.get(hero)!;
  if (slot === "E") ab.slots.E.cooldownRemainingTicks = 0;
  const h = world.health.get(hero)!;
  h.mana = h.maxMana;
  const res = castAbility(world, hero, slot, target);
  if (res !== "ok") {
    const e = target.type === "entity" ? target.entityId : undefined;
    console.log(`[castUntil ${slot}] res=${res} tick=${world.tick} heroT=${JSON.stringify(world.transform.get(hero))} heroH=${JSON.stringify(world.health.get(hero))} ab=${JSON.stringify(ab)} enemyT=${e !== undefined ? JSON.stringify(world.transform.get(e)) : "-"} enemyH=${e !== undefined ? JSON.stringify(world.health.get(e)) : "-"} status=${JSON.stringify(world.status.get(hero))}`);
  }
  expect(res, `${slot} 按不下去`).toBe("ok");
  for (let i = 0; i < Math.round(4 / world.dt); i++) {
    tick(world, hero);
    if (done()) return;
  }
  throw new Error(`${slot} 在 4 秒內沒有落地`);
}
function castE(world: SimWorld, hero: EntityId, enemy: EntityId): number {
  tick(world, hero);
  const eh = world.health.get(enemy)!;
  eh.hp = eh.maxHp;
  let amount: number | undefined;
  castUntil(world, hero, "E", { type: "entity", entityId: enemy }, () => {
    const hit = world.events.find((e) => e.type === "damage" && e.data["target"] === enemy && String(e.data["origin"]).endsWith(".e"));
    if (hit) amount = hit.data["amount"] as number;
    return amount !== undefined;
  });
  return amount!;
}

describe("probe: ② 在 passive 帶 statusId 之後會綠", () => {
  it("真的按 11-00 → 期間吃得到 → 到期後不吃", () => {
    const buff = Abilities.get(`${ZORO}.passive` as AbilityId).effects.find((e) => e.kind === "applyBuff") as Extract<EffectDef, { kind: "applyBuff" }>;
    const { world, hero, enemy } = stage();
    const plain = castE(world, hero, enemy);
    const dbg = (tag: string): void => {
      const eh = world.health.get(enemy)!; const et = world.transform.get(enemy); const ht = world.transform.get(hero);
      console.log(`[${tag}] tick=${world.tick} enemy alive=${eh.alive} hp=${eh.hp}/${eh.maxHp} zone=${et?.zone} pos=${JSON.stringify(et?.pos)} hero zone=${ht?.zone} pos=${JSON.stringify(ht?.pos)} hasStatus=${hasStatus(world, hero, SID)} cast=${JSON.stringify(world.abilities.get(hero)!.cast)}`);
    };
    dbg("after plain");
    castUntil(world, hero, "PASSIVE", { type: "self" }, () => hasStatus(world, hero, SID));
    dbg("after passive");
    const during = castE(world, hero, enemy);
    const limit = Math.round(((buff.duration ?? 0) + 1) / world.dt);
    let n = 0;
    for (; n < limit && hasStatus(world, hero, SID); n++) tick(world, hero);
    expect(hasStatus(world, hero, SID), "三刀流沒有到期").toBe(false);
    const after = castE(world, hero, enemy);
    console.log(`plain=${plain} during=${during} after=${after} expiredAfterTicks=${n} dt=${world.dt}`);
    expect(during).toBeGreaterThan(plain);
    expect(after).toBeCloseTo(plain, 6);
  });
});
