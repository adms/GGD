/** GH#1197 回程彈／分裂彈 —— 發射**出貨的** projectile 文件：從彈體當下位置換相、⛔ 不重播第一段、⛔ 沒有額外命中；變體文件只比底稿多一格。 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { Projectiles, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../content/defs";

const Z0 = SKELETON_ARENA.zones[0]!;
const doc = (id: string) => JSON.parse(readFileSync(new URL(`../../../../../content/projectiles/${id}.json`, import.meta.url), "utf8")) as ProjectileDef & { schema?: string };
const shipped = (id: string): ProjectileDef => { const { schema: _s, ...def } = doc(id); return def; };
const [ORB, MAIN] = [shipped("imported.wave.arcane.return"), shipped("imported.bolt.void.split")];
beforeAll(() => { registerSkeletonContent(); for (const def of [ORB, MAIN, shipped(MAIN.split!.projectileId)]) Projectiles.register(def.id, def); });
const arena = (name: "orb" | "split", foeDx: number, foeDz = 0) => {
  const id = `test.projphase.${name}` as ChampionId;
  const q = { id: `${id}.q` as AbilityId, name, slot: "Q", castType: "skillshot", maxRank: 1, cooldown: [10], manaCost: [0], range: 20, targetsEnemies: true,
    effects: [{ kind: "spawnProjectile", projectileId: (name === "orb" ? ORB : MAIN).id, onHit: [{ kind: "damage", damageType: "true", amount: { flat: 30 } }] }],
    ...(name === "split" ? { recast: { charges: 1, windowSec: 2 }, recastEffects: [] } : {}) } as AbilityDef;
  registerChampion({ ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } } as ChampionDef, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 99);
  const caster = spawnChampion(world, { championId: id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...Z0.center }, zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: Z0.center.x + foeDx, z: Z0.center.z + foeDz }, zone: 0 });
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const step = () => { world.step(new Map()); events.push(...world.events); };
  step();
  const projs = () => [...world.projectile.entries()].map(([pid, p]) => ({ ...p, pos: { ...world.transform.get(pid)!.pos } }));
  const until = (pred: () => boolean) => { for (let i = 0; i < 90 && !pred(); i++) step(); };
  const foeHits = () => events.filter((e) => e.type === "projectileHit" && e.data.owner === caster && e.data.target === foe).length;
  return { events, step, projs, until, foeHits, q: () => castAbility(world, caster, "Q", { type: "dir", dir: { x: 1, z: 0 } }) };
};

describe("彈道換相（GH#1197，出貨文件）", () => {
  it("returns：去程一次、從射程盡頭掉頭（⛔ 不是從施法者身上重播）、回程再一次", () => {
    const a = arena("orb", ORB.maxRange / 3);
    expect(a.q()).toBe("ok");
    a.until(() => a.projs()[0]?.phase === "return" || a.projs().length === 0);
    expect([a.projs()[0]?.phase, a.foeHits(), a.projs()[0]!.pos.x - Z0.center.x > ORB.maxRange / 2]).toEqual(["return", 1, true]);
    a.until(() => a.projs().length === 0);
    expect(a.foeHits()).toBe(2);
  });

  it("split：命中時從撞擊點左右分出、⛔ 不再打主彈打過的人；再次施放時還在飛的主彈就地換成兩發", () => {
    const s = arena("split", 3, 0.3); // 稍偏一側 ⇒ 朝那一側分出的子彈出生就貼著他
    const end = () => s.events.find((e) => e.type === "projectileEnd" && e.data.projectileId === MAIN.id);
    expect(s.q()).toBe("ok");
    s.until(() => end() !== undefined);
    const kids = s.projs(); s.until(() => s.projs().length === 0);
    expect([s.foeHits(), kids.map((k) => Math.round(k.dir.z)).sort(), kids.every((k) => Math.abs(k.pos.x - (end()!.data.x as number)) < 1e-6)]).toEqual([1, [-1, 1], true]);
    const re = arena("split", 30); // 敵人在射程外：主彈不會命中
    expect(re.q()).toBe("ok");
    re.step(); const [main] = re.projs();
    expect([re.q(), re.projs().map((p) => [p.projectileId, p.pos])]).toEqual(["ok", [[MAIN.split!.projectileId, main!.pos], [MAIN.split!.projectileId, main!.pos]]]);
  });

  it("變體文件只比底稿多一格（schema 沒有繼承 ⇒ 逐格對得起來，兩份才不會各自漂）", () => {
    for (const [variant, base, extra] of [[ORB, "imported.wave.arcane", "returns"], [MAIN, "imported.bolt.void", "split"]] as const) {
      const [{ id: _v, [extra]: _x, ...rest }, { id: _b, schema: _s, ...baseRest }] = [variant, doc(base)] as unknown as [Record<string, unknown>, Record<string, unknown>];
      expect(rest, `${variant.id} 與 ${base} 分岔了`).toEqual(baseRest);
    }
  });
});
