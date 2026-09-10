/** GH#1197 阿璃 Q 回程彈 · 威寇茲 Q 分裂彈 —— 跑出貨 spawnProjectile／ProjectileSystem／castAbility。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { Projectiles, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type ProjectileId, type SeatId } from "../../ids";
import type { AbilityDef, ChampionDef } from "../content/defs";
import type { EffectDef } from "../effects/effect";
import type { IntentFrame } from "../intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const at = (dx: number) => ({ x: Z0.center.x + dx, z: Z0.center.z });
const HIT: EffectDef[] = [{ kind: "damage", damageType: "true", amount: { flat: 30 } }];
const P = { orb: "test.p.orb" as ProjectileId, main: "test.p.main" as ProjectileId, child: "test.p.child" as ProjectileId };
const CH = {} as { orb: ChampionId; split: ChampionId };
const qDef = (name: string, effects: EffectDef[], extra: Partial<AbilityDef> = {}): AbilityDef => ({
  id: `test.projphase.${name}` as AbilityId, name, slot: "Q", castType: "skillshot",
  maxRank: 1, cooldown: [10], manaCost: [0], range: 20, targetsEnemies: true, effects, ...extra,
});
beforeAll(() => {
  registerSkeletonContent();
  Projectiles.register(P.orb, { id: P.orb, speed: 20, maxRange: 8, hitRadius: 0.5, pierce: true, returns: true });
  Projectiles.register(P.child, { id: P.child, speed: 20, maxRange: 6, hitRadius: 0.5 });
  Projectiles.register(P.main, { id: P.main, speed: 20, maxRange: 12, hitRadius: 0.5, split: { projectileId: P.child, on: ["hit", "recast"] } });
  const mk = (name: string, q: AbilityDef): ChampionId => {
    const id = `test.projphase.champ.${name}` as ChampionId;
    registerChampion({ ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } } as ChampionDef, { overrideAbilities: true });
    return id;
  };
  CH.orb = mk("orb", qDef("orb", [{ kind: "spawnProjectile", projectileId: P.orb, onHit: HIT }]));
  CH.split = mk("split", qDef("split", [{ kind: "spawnProjectile", projectileId: P.main, onHit: HIT }], { recast: { charges: 1, windowSec: 2 }, recastEffects: [] }));
});
const arena = (champ: ChampionId, foeDx: number) => {
  const world = new SimWorld(SKELETON_ARENA, 99);
  const caster = spawnChampion(world, { championId: champ, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(foeDx), zone: 0 });
  world.step(NO_INTENTS);
  const projs = () => [...world.projectile.values()];
  const until = (pred: () => boolean, max = 60): void => { for (let i = 0; i < max && !pred(); i++) world.step(NO_INTENTS); };
  return { world, caster, foe, foeHp: () => world.health.get(foe)!.hp, projs, until };
};

describe("彈道換相（GH#1197）", () => {
  it("returns：去程打一次、射程盡頭掉頭、回程再打一次，回到施法者身上消失", () => {
    const a = arena(CH.orb, 4);
    const hp0 = a.foeHp();
    expect(castAbility(a.world, a.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    a.until(() => a.projs()[0]?.phase === "return" || a.projs().length === 0); // 去程 4 格命中、8 格盡頭掉頭
    const hp1 = a.foeHp();
    expect(hp1).toBeLessThan(hp0);
    expect(a.projs()[0]?.phase).toBe("return"); // ⭐ 承重：沒有 returns 這裡已經沒有彈了
    a.until(() => a.projs().length === 0);
    expect(a.foeHp()).toBeLessThan(hp1); // 回程又打到同一個人（命中分開記錄）
    expect(a.projs()).toHaveLength(0); // 回到施法者身上收掉
  });

  it("split：命中 ⇒ 兩發垂直子彈、主彈退場；再次施放 ⇒ 還在飛的主彈也分裂", () => {
    const hit = arena(CH.split, 3);
    expect(castAbility(hit.world, hit.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    hit.until(() => hit.projs().every((p) => p.projectileId === P.child) && hit.projs().length > 0);
    const kids = hit.projs();
    expect(kids.map((p) => p.projectileId).sort()).toEqual([P.child, P.child]);
    expect(kids.map((p) => Math.round(p.dir.z)).sort()).toEqual([-1, 1]); // 垂直左右

    const re = arena(CH.split, 30); // 敵人在射程外：主彈不會命中
    expect(castAbility(re.world, re.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    re.world.step(NO_INTENTS);
    expect(re.projs().map((p) => p.projectileId)).toEqual([P.main]);
    expect(castAbility(re.world, re.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok"); // 後段
    expect(re.projs().map((p) => p.projectileId).sort()).toEqual([P.child, P.child]); // ⭐ 承重：主彈換成兩發子彈
  });
});
