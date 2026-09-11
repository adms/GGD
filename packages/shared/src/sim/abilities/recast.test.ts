/**
 * 【再次施放】（GH#1187）承重守衛 —— 跑**出貨的** castAbility／tickCooldowns／damage 管線，⛔ 不手造狀態。
 * 驗機制（會不會發生），⛔ 不驗數字（幾段、幾秒都是內容的）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "./abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef, AbilityRecast, ChampionDef } from "../content/defs";
import type { EffectDef } from "../effects/effect";
import type { IntentFrame } from "../intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const at = (dz: number) => ({ x: Z0.center.x, z: Z0.center.z + dz });
const HIT: EffectDef[] = [{ kind: "damage", damageType: "true", amount: { flat: 50 } }];
const MISS: EffectDef[] = []; // 什麼都不碰 ⇒ 沒有任何封包 connect

const qDef = (name: string, recast: AbilityRecast, effects: EffectDef[], recastEffects?: EffectDef[]): AbilityDef => ({
  id: `test.recast.${name}` as AbilityId, name, slot: "Q", castType: "targeted",
  maxRank: 1, cooldown: [10], manaCost: [0], range: 20, targetsEnemies: true, effects, recast,
  ...(recastEffects ? { recastEffects } : {}),
});
const champ = (name: string, q: AbilityDef): ChampionId => {
  const id = `test.recast.champ.${name}` as ChampionId;
  registerChampion({ ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } } as ChampionDef, { overrideAbilities: true });
  return id;
};
const CH = {} as { plain: ChampionId; end: ChampionId; hit: ChampionId; miss: ChampionId; alt: ChampionId; anchor: ChampionId };
beforeAll(() => {
  registerSkeletonContent();
  CH.plain = champ("plain", qDef("plain", { charges: 1, windowSec: 2 }, HIT)); // 首段 + 1 段後段
  CH.end = champ("end", qDef("end", { charges: 1, windowSec: 2, cooldownAt: "end" }, HIT));
  CH.hit = champ("hit", qDef("hit", { charges: 1, windowSec: 2, gate: "onHit" }, HIT));
  CH.miss = champ("miss", qDef("miss", { charges: 1, windowSec: 2, gate: "onHit" }, MISS));
  CH.alt = champ("alt", qDef("alt", { charges: 1, windowSec: 2 }, HIT, [{ kind: "damage", damageType: "true", amount: { flat: 5 } }]));
  CH.anchor = champ("anchor", { ...qDef("anchor", { charges: 1, windowSec: 2, anchor: "firstCast" }, HIT), castType: "ground", radius: 2.5 });
});

function arena(championId: ChampionId) {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const caster = spawnChampion(world, { championId, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(6), zone: 0 }); // 6 格外：普攻搆不到 ⇒ 血量只有技能在動
  world.step(NO_INTENTS);
  const q = () => castAbility(world, caster, "Q", { type: "entity", entityId: foe });
  const foeHp = () => world.health.get(foe)!.hp;
  const slot = () => world.abilities.get(caster)!.slots.Q;
  return { world, caster, q, foeHp, slot };
}

describe("【再次施放】GH#1187", () => {
  it("窗口內第二按不撞冷卻、效果再跑一次；次數用完之後才是冷卻", () => {
    const a = arena(CH.plain);
    const hp0 = a.foeHp();
    expect(a.q()).toBe("ok");
    a.world.step(NO_INTENTS);
    expect(a.slot().cooldownRemainingTicks).toBeGreaterThan(0); // cooldownAt 缺 = first：冷卻已在跑
    const hp1 = a.foeHp();
    expect(hp1).toBeLessThan(hp0);
    expect(a.slot().recast?.chargesLeft).toBe(1);
    expect(a.q()).toBe("ok"); // ⭐ 承重：沒有這個機制這裡是 "cooldown"
    a.world.step(NO_INTENTS);
    expect(a.foeHp()).toBeLessThan(hp1); // 後段真的再打了一次
    expect(a.slot().recast).toBeUndefined();
    expect(a.q()).toBe("cooldown");
  });

  it("窗口到期 ⇒ 後段消失，按下去回到普通施放（撞冷卻）", () => {
    const a = arena(CH.plain);
    expect(a.q()).toBe("ok");
    const until = a.slot().recast!.untilTick;
    while (a.world.tick <= until) a.world.step(NO_INTENTS); // tickCooldowns 在 tick 累加前跑 ⇒ 多走一格
    expect(a.slot().recast).toBeUndefined();
    expect(a.q()).toBe("cooldown");
  });

  it("cooldownAt:end ⇒ 首段不起冷卻，最後一段放完才寫", () => {
    const a = arena(CH.end);
    expect(a.q()).toBe("ok");
    expect(a.slot().cooldownRemainingTicks).toBe(0);
    a.world.step(NO_INTENTS);
    expect(a.q()).toBe("ok");
    expect(a.slot().cooldownRemainingTicks).toBeGreaterThan(0);
  });

  it("gate:onHit ⇒ 首段打中才開後段；打空回 recast-gate", () => {
    const hit = arena(CH.hit);
    expect(hit.q()).toBe("ok");
    hit.world.step(NO_INTENTS); // 傷害封包在 step 裡結算 ⇒ markRecastHit
    expect(hit.q()).toBe("ok");
    const miss = arena(CH.miss);
    expect(miss.q()).toBe("ok");
    miss.world.step(NO_INTENTS);
    expect(miss.q()).toBe("recast-gate");
  });

  it("recastEffects 有寫 ⇒ 後段跑它，不是首段的 effects", () => {
    const a = arena(CH.alt);
    const hp0 = a.foeHp();
    expect(a.q()).toBe("ok");
    a.world.step(NO_INTENTS);
    const d1 = hp0 - a.foeHp();
    expect(a.q()).toBe("ok");
    a.world.step(NO_INTENTS);
    const d2 = hp0 - d1 - a.foeHp();
    expect(d2).toBeGreaterThan(0);
    expect(d2).toBeLessThan(d1); // recastEffects 是 5，首段是 50 —— ⛔ 不釘數字，釘「不是同一份」
  });
});

describe("recast.anchor:firstCast（GH#1197 威寇茲 W）", () => {
  it("後段釘在首段落點：第二按指向別處，打到的還是首段那一圈", () => {
    const a = arena(CH.anchor);
    const hp0 = a.foeHp();
    const foePos = { x: Z0.center.x, z: Z0.center.z + 6 };
    expect(castAbility(a.world, a.caster, "Q", { type: "point", point: foePos })).toBe("ok");
    a.world.step(NO_INTENTS);
    const hp1 = a.foeHp();
    expect(hp1).toBeLessThan(hp0);
    expect(castAbility(a.world, a.caster, "Q", { type: "point", point: { x: Z0.center.x, z: Z0.center.z - 6 } })).toBe("ok");
    a.world.step(NO_INTENTS);
    expect(a.foeHp()).toBeLessThan(hp1); // ⭐ 承重：沒有 anchor 這一發落在反方向，敵人不掉血
  });
});
