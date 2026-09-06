/**
 * ⭐ GH#1050 —— `tpl-pull-throw` 的 `throwDistance` 要從**真的施法入口**穿透到落點。
 *
 * 票文量到：expand 把這一族展成 ground cast、施法入口必給 `ctx.point`、而 `leap`
 * 只在**沒有** point 的分支讀 `throwDistance` ⇒ 同一個施法點，100 與 1000 落在同一格。
 * ⛔ 拿「展開 JSON 的數字變了」或「直接 runEffects 不給 point」當證據都是形態⑤
 *（被測的不是出貨的那條路）。這一支走的是註冊表真的走的路：
 * template 綁定 → `resolveTemplateExpansion` → `zAbilityDoc.parse` → `Abilities.register`
 * → `castAbility(Q, point)` → `nav.override.to` → 飛完之後**身體的座標**。
 *
 * ── 突變紀錄（真的做過：改壞 → 紅 → 用 Edit 改回來）────────────────────────
 *  · `sim/effects/leap.ts` 的分支條件 `e.throwDistance !== undefined` 改回舊的
 *    `ctx.point === undefined` ⇒ ①紅：兩個距離的落點 x 相等（都是選點）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { Abilities } from "../content/registry";
import { castAbility } from "../abilities/abilitySystem";
import { zeroStats } from "../stats/statTypes";
import { zTemplateDoc } from "../../content/schema/template";
import { zAbilityDoc } from "../../content/schema/ability";
import { resolveTemplateExpansion } from "../../content/templates/resolve";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { IntentFrame } from "../intents";

const TPL = zTemplateDoc.parse(
  JSON.parse(
    readFileSync(join(__dirname, "../../../../..", "content/ability-templates/tpl-pull-throw.json"), "utf-8"),
  ),
);
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/** 出貨的註冊路徑（`registries.ts` 的 `expandIfTemplated`），⛔ 不是手拼的 effects。 */
function registerThrow(throwDistance: number): AbilityId {
  const doc = {
    schema: "ability@1", id: `test.pull-throw-${throwDistance}`, name: "fixture 拉扯投擲", slot: "Q",
    castType: "ground", maxRank: 1, cooldown: [0], manaCost: [0], range: 8, effects: [],
    template: { ref: TPL.id, params: { throwDistance } },
  };
  const r = resolveTemplateExpansion(doc, new Map([[TPL.id, TPL]]));
  if (!r.ok) throw new Error(r.failure.message);
  const def = zAbilityDoc.parse(r.merged) as unknown as AbilityDef;
  Abilities.register(def.id, def);
  return def.id;
}

function body(world: SimWorld, x: number, z: number, team: number, q?: AbilityId): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { x, z }, vel: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, radius: 0.5, zone: 0 });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 500, maxMana: 500, alive: true, shields: [] });
  world.status.set(id, { effects: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(team) });
  world.stats.set(id, { championId: "sela" as ChampionId, final: zeroStats(), dirty: false, sources: [] });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  if (q !== undefined) {
    const slot = (rank: number) => ({ abilityId: q, rank, cooldownRemainingTicks: 0 });
    world.abilities.set(id, { slots: { Q: slot(1), W: slot(0), E: slot(0), R: slot(0) }, basicAttackCdTicks: 0, unspentPoints: 0 });
  }
  return id;
}

/** 施法者在圈心西邊 4 格、選點在西邊 2 格、兩名敵人貼著選點 —— 票文的重現佈局。 */
function arena(throwDistance: number) {
  const world = new SimWorld(SKELETON_ARENA, 1050);
  const caster = body(world, C.x - 4, C.z, 0, registerThrow(throwDistance));
  const point = { x: C.x - 2, z: C.z };
  const victims = [body(world, point.x, point.z + 0.3, 1), body(world, point.x, point.z - 0.3, 1)];
  world.rebuildGrid();
  return { world, caster, point, victims };
}

function landings(world: SimWorld, ids: EntityId[]): { x: number; z: number }[] {
  return ids.map((id) => {
    const ov = world.nav.get(id)!.override;
    if (ov?.kind !== "leap") throw new Error(`entity ${String(id)} was not thrown`);
    return ov.to;
  });
}

describe("拉扯投擲：throwDistance 從 castAbility(Q, point) 穿透到落點（GH#1050）", () => {
  it("① 同一個施法點、兩個合法距離 ⇒ 兩個不同的落點，而且都不是選點本身；圈裡每一個敵人都被丟", () => {
    const near = arena(100);
    const far = arena(1000);
    expect(castAbility(near.world, near.caster, "Q", { type: "point", point: near.point })).toBe("ok");
    expect(castAbility(far.world, far.caster, "Q", { type: "point", point: far.point })).toBe("ok");
    // 多人契約：ground 小圈裡的兩名敵人**都**在飛（`landings` 對沒被丟的會 throw）
    const nearTo = landings(near.world, near.victims);
    const farTo = landings(far.world, far.victims);
    // ⭐ 承重斷言：throwDistance 真的改了落點 —— 缺陷的樣子是這兩個數字相等
    expect(farTo[0]!.x).toBeGreaterThan(nearTo[0]!.x);
    // 選點不是終點（票文：100 與 1000 都落在 (-38,0) = 選點）
    expect(Math.abs(farTo[0]!.x - far.point.x)).toBeGreaterThan(0.5);
    // 飛完之後**身體**真的到了不同的地方（⛔ 不只是 override 上的數字）
    for (const s of [near, far])
      for (let i = 0; i < 60 && s.world.nav.get(s.victims[0]!)!.override !== null; i++) s.world.step(NO_INTENTS);
    const nearX = near.world.transform.get(near.victims[0]!)!.pos.x;
    const farX = far.world.transform.get(far.victims[0]!)!.pos.x;
    expect(farX - nearX).toBeGreaterThan(0.5);
  });

  it("② ground 契約：實體目標指令被拒（bad-target）—— ⛔ 沒有偷偷改成單體指定", () => {
    const s = arena(500);
    expect(castAbility(s.world, s.caster, "Q", { type: "entity", entityId: s.victims[0]! })).toBe("bad-target");
  });
});
