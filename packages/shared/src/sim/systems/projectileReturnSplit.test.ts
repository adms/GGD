/**
 * GH#1197 阿璃 Q 回程彈 · 威寇茲 Q 分裂彈 —— 發射**出貨的** projectile 文件（⛔ 不是測試自己造的定義），
 * 跑 spawnProjectile／ProjectileSystem／castAbility。驗收：從彈體**當下位置**換相、⛔ 不重播第一段、⛔ 沒有額外命中。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { Projectiles, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { zProjectileDoc } from "../../content/schema/projectile";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../content/defs";
import type { EffectDef } from "../effects/effect";
import type { IntentFrame } from "../intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const at = (dx: number, dz = 0) => ({ x: Z0.center.x + dx, z: Z0.center.z + dz });
const HIT: EffectDef[] = [{ kind: "damage", damageType: "true", amount: { flat: 30 } }];
/** 出貨文件（`content/projectiles/`）—— 回程法球、分裂主彈，以及分裂主彈指名的子彈。 */
const shipped = (id: string): ProjectileDef => {
  const { schema: _schema, ...def } = zProjectileDoc.parse(JSON.parse(readFileSync(new URL(`../../../../../content/projectiles/${id}.json`, import.meta.url), "utf8")));
  return def as ProjectileDef;
};
const ORB = shipped("imported.wave.arcane.return");
const MAIN = shipped("imported.bolt.void.split");
const CH = {} as { orb: ChampionId; split: ChampionId };
const qDef = (name: string, effects: EffectDef[], extra: Partial<AbilityDef> = {}): AbilityDef => ({
  id: `test.projphase.${name}` as AbilityId, name, slot: "Q", castType: "skillshot",
  maxRank: 1, cooldown: [10], manaCost: [0], range: 20, targetsEnemies: true, effects, ...extra,
});
beforeAll(() => {
  registerSkeletonContent();
  for (const def of [ORB, MAIN, shipped(MAIN.split!.projectileId)]) Projectiles.register(def.id, def);
  const mk = (name: string, q: AbilityDef): ChampionId => {
    const id = `test.projphase.champ.${name}` as ChampionId;
    registerChampion({ ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } } as ChampionDef, { overrideAbilities: true });
    return id;
  };
  CH.orb = mk("orb", qDef("orb", [{ kind: "spawnProjectile", projectileId: ORB.id, onHit: HIT }]));
  CH.split = mk("split", qDef("split", [{ kind: "spawnProjectile", projectileId: MAIN.id, onHit: HIT }], { recast: { charges: 1, windowSec: 2 }, recastEffects: [] }));
});
const arena = (champ: ChampionId, foeDx: number, foeDz = 0) => {
  const world = new SimWorld(SKELETON_ARENA, 99);
  const caster = spawnChampion(world, { championId: champ, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(foeDx, foeDz), zone: 0 });
  world.step(NO_INTENTS);
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const step = () => { world.step(NO_INTENTS); events.push(...world.events); };
  const projs = () => [...world.projectile.entries()].map(([id, p]) => ({ ...p, pos: { ...world.transform.get(id)!.pos } }));
  const until = (pred: () => boolean, max = 90): void => { for (let i = 0; i < max && !pred(); i++) step(); };
  /** 施法者的彈打中這個敵人幾次（去程／回程／子彈全算）。 */
  const foeHits = () => events.filter((e) => e.type === "projectileHit" && e.data.owner === caster && e.data.target === foe).length;
  const q = () => castAbility(world, caster, "Q", { type: "dir", dir: { x: 1, z: 0 } });
  return { events, step, projs, until, foeHits, q };
};

describe("彈道換相（GH#1197，出貨文件）", () => {
  it("returns：去程打一次、射程盡頭掉頭、回程再打一次，回到施法者身上消失", () => {
    const a = arena(CH.orb, ORB.maxRange / 3);
    expect(a.q()).toBe("ok");
    a.until(() => a.projs()[0]?.phase === "return" || a.projs().length === 0);
    expect(a.projs()[0]?.phase).toBe("return"); // ⭐ 承重：文件沒有 returns 這裡已經沒有彈了
    expect(a.foeHits(), "去程穿過敵人只算一次").toBe(1);
    expect(a.projs()[0]!.pos.x - Z0.center.x, "從射程盡頭掉頭（⛔ 不是從施法者身上重播）").toBeGreaterThan(ORB.maxRange / 2);
    a.until(() => a.projs().length === 0);
    expect(a.foeHits(), "回程再打到同一個人一次（命中分開記錄）、⛔ 沒有第三下").toBe(2);
  });

  it("split on hit：子彈從主彈撞到的那一點左右分出，⛔ 不再打主彈打過的人", () => {
    const s = arena(CH.split, 3, 0.3); // 稍偏一側 ⇒ 朝那一側分出的子彈出生就貼著他
    const mainEnd = () => s.events.find((e) => e.type === "projectileEnd" && e.data.projectileId === MAIN.id);
    expect(s.q()).toBe("ok");
    s.until(() => mainEnd() !== undefined);
    const kids = s.projs();
    s.until(() => s.projs().length === 0);
    expect(s.foeHits(), "主彈打一次；子彈⛔ 不再打同一個人").toBe(1);
    expect(kids.map((k) => k.projectileId)).toEqual([MAIN.split!.projectileId, MAIN.split!.projectileId]);
    expect(kids.map((k) => Math.round(k.dir.z)).sort()).toEqual([-1, 1]); // 垂直左右
    for (const k of kids) expect(k.pos.x, "子彈從撞擊點分出").toBeCloseTo(mainEnd()!.data.x as number, 6);
  });

  it("split on recast：再次施放 ⇒ 還在飛的主彈就地換成兩發子彈", () => {
    const re = arena(CH.split, 30); // 敵人在射程外：主彈不會命中
    expect(re.q()).toBe("ok");
    re.step();
    const [main] = re.projs();
    expect(main?.projectileId).toBe(MAIN.id);
    expect(re.q()).toBe("ok"); // 後段
    const kids = re.projs();
    expect(kids.map((p) => p.projectileId)).toEqual([MAIN.split!.projectileId, MAIN.split!.projectileId]); // ⭐ 承重：主彈換成兩發子彈
    for (const k of kids) expect(k.pos, "⛔ 從施法者身上重射一次＝重播第一段").toEqual(main!.pos);
  });
});
