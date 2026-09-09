import { beforeAll, describe, expect, it } from "vitest";
import { zEffectDef } from "../content/schema/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ProjectileId, type StatusId } from "../ids";
import { SimWorld } from "./SimWorld";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { runEffects } from "./effects/effectRunner";
import type { EffectDef } from "./effects/effect";
import { combatResolveSystem } from "./combat/damage";
import { castAbility } from "./abilities/abilitySystem";
import { isTimeStopped, timeStopSystem } from "./timeStop";
import { restoreForNextRound } from "./clearPools";
import { carrySystem } from "./systems/CarrySystem";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";

beforeAll(registerSkeletonContent);
function rig() {
  const w = new SimWorld(SKELETON_ARENA, 1132), centre = SKELETON_ARENA.zones[0]!.center;
  const ids = [0, 1, 2, 3].map(i => spawnChampion(w, { championId: SELA.id as ChampionId, zone: 0,
    seatId: asSeatId(i), teamId: asTeamId(i === 1 || i === 3 ? 1 : 0),
    pos: { x: centre.x + [0, 2, -2, 10][i]!, z: centre.z + 7 } }));
  const [a, foe, ally, far] = ids as [EntityId, EntityId, EntityId, EntityId];
  for (const id of ids) {
    w.nav.get(id)!.order = { kind: "hold" };
    const hp = w.health.get(id)!; hp.hp = hp.maxHp = 10000; hp.mana = hp.maxMana = 1000;
    w.abilities.get(id)!.slots.Q.rank = 1;
  }
  const run = (caster: EntityId, effects: EffectDef[], targets = [foe]) => runEffects(effects.map(e => zEffectDef.parse(e) as EffectDef), {
    world: w, caster, rank: 1, targets, origin: "ability:time-stop-fixture", rng: w.rng,
  });
  const stop = (caster = a, durationSec = 0.2, maxQueuedHits = 64) => {
    run(caster, [{ kind: "timeStop", radius: 4, durationSec, maxQueuedHits }], []);
    return [...w.timeStop.keys()].at(-1)!;
  };
  const hit = (source = a, target = foe, amount = 100) => {
    w.damageQueue.push({ source, target, amount, type: "true", origin: "ability:test-hit", crit: false });
    combatResolveSystem(w);
  };
  const step = (n = 1) => { for (let i = 0; i < n; i++) w.step(new Map()); };
  const projectile = (owner: EntityId, x = 1, speed = 12) => {
    const id = w.spawn(), t = w.transform.get(a)!;
    w.transform.set(id, { pos: { x: t.pos.x + x, z: t.pos.z + 2 }, vel: { x: speed, z: 0 }, facing: { x: 1, z: 0 }, radius: 0.1, zone: 0 });
    w.projectile.set(id, { projectileId: "test" as ProjectileId, ownerId: owner, dir: { x: 1, z: 0 }, speed,
      remainingRange: 30, hitRadius: 0.1, pierce: false, hitSet: new Set(), onHit: [], rank: 1, origin: "ability:test" });
    return id;
  };
  w.rebuildGrid();
  return { w, a, foe, ally, far, run, stop, hit, step, projectile };
}

describe("local time stop", () => {
  it("strict schema rejects unbounded fields, queues and unknown clock policies", () => {
    const good = { kind: "timeStop", radius: 4, durationSec: 1 };
    expect(zEffectDef.safeParse(good).success).toBe(true);
    for (const change of [{ radius: 0 }, { radius: 13 }, { durationSec: 6 }, { maxQueuedHits: 129 }, { maxQueuedHits: 0 }, { pauseMatch: true }]) {
      expect(zEffectDef.safeParse({ ...good, ...change }).success).toBe(false);
    }
  });

  it("freezes only nearby enemies in the same zone and holds movement and aim", () => {
    const r = rig(), before = structuredClone(r.w.transform.get(r.foe)!);
    r.w.nav.get(r.foe)!.moveTarget = { x: before.pos.x + 6, z: before.pos.z };
    r.stop(); expect(isTimeStopped(r.w, r.foe)).toBe(true);
    for (const id of [r.a, r.ally, r.far]) expect(isTimeStopped(r.w, id)).toBe(false);
    r.w.step(new Map([[asSeatId(1), { seq: 1, tick: 0, commands: [], aim: { x: -1, z: 0 }, order: { kind: "move", point: { x: 20, z: 20 } } }]]));
    expect(r.w.transform.get(r.foe)!.pos).toEqual(before.pos);
    expect(r.w.transform.get(r.foe)!.facing).toEqual(before.facing);
    r.w.transform.get(r.foe)!.zone = 1;
    expect(isTimeStopped(r.w, r.foe)).toBe(false);
  });

  it("rejects frozen casts without spending mana or cooldown; owner can still cast", () => {
    const r = rig(); r.stop(); const ab = structuredClone(r.w.abilities.get(r.foe)), mana = r.w.health.get(r.foe)!.mana;
    expect(castAbility(r.w, r.foe, "Q", { type: "entity", entityId: r.a })).toBe("time-stopped");
    expect(r.w.abilities.get(r.foe)).toEqual(ab); expect(r.w.health.get(r.foe)!.mana).toBe(mana);
    expect(castAbility(r.w, r.a, "Q", { type: "entity", entityId: r.foe })).not.toBe("time-stopped");
  });

  it("holds cast, recovery, basic windup, cooldown and hitstop counters", () => {
    const r = rig(), ab = r.w.abilities.get(r.foe)!;
    const base = { slot: "Q" as const, abilityId: ab.slots.Q.abilityId, rank: 1 };
    ab.cast = { ...base, ticksLeft: 5, targets: [r.a], rooted: true, hpAtStart: 10000 };
    ab.recovery = { ...base, ticksLeft: 7, totalTicks: 7, roots: true };
    ab.windup = { target: r.a, ticksLeft: 3 }; ab.basicAttackCdTicks = 12; ab.slots.Q.cooldownRemainingTicks = 20;
    r.w.hitstop.set(r.foe, 2); r.stop(); r.step(3);
    expect(ab.cast?.ticksLeft).toBe(5); expect(ab.recovery?.ticksLeft).toBe(7);
    expect(ab.windup?.ticksLeft).toBe(3); expect(ab.basicAttackCdTicks).toBe(12);
    expect(ab.slots.Q.cooldownRemainingTicks).toBe(20); expect(r.w.hitstop.get(r.foe)).toBe(2);
    expect(r.w.tick).toBe(3);
  });

  it("holds status, buff, shield and DoT clocks without paying overdue ticks on thaw", () => {
    const r = rig();
    r.run(r.foe, [{ kind: "applyStatus", applyTo: "self", statusId: "fixture" as StatusId, duration: 1 },
      { kind: "applyBuff", applyTo: "self", duration: 1, modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 1 }] },
      { kind: "shield", amount: { flat: 200, ratios: [] }, duration: 1 }], [r.foe]);
    r.run(r.a, [{ kind: "dot", damageType: "true", amountPerTick: { flat: 10, ratios: [] }, intervalSec: 0.1, durationSec: 1 }]);
    const dot = r.w.dot.get(r.foe)![0]!, first = dot.nextTick, expiry = dot.expiresAtTick;
    const status = r.w.status.get(r.foe)!.effects[0]!, statusExpiry = status.expiresAtTick;
    r.stop(); r.step(6);
    expect(dot.nextTick).toBe(first + 6); expect(dot.expiresAtTick).toBe(expiry + 6);
    expect(status.expiresAtTick).toBe(statusExpiry + 6); expect(r.w.health.get(r.foe)!.shields[0]!.amount).toBe(200);
    r.step(3); expect(r.w.health.get(r.foe)!.shields[0]!.amount).toBe(200);
    r.step(); expect(r.w.health.get(r.foe)!.shields[0]!.amount).toBeLessThan(200);
  });

  it("holds a carried enemy in place and still releases it when its carrier dies", () => {
    const r = rig(), pos = { ...r.w.transform.get(r.foe)!.pos };
    r.w.carried.set(r.foe, { carrier: r.far, expiresAtTick: 30, blocksAutoAcquire: true,
      blocksMobAggro: true, blocksManualTarget: true, blocksAbilityAoe: true, onCarrierDeath: "release" });
    r.stop(); r.step(3);
    expect(r.w.transform.get(r.foe)!.pos).toEqual(pos); expect(r.w.carried.get(r.foe)!.expiresAtTick).toBe(33);
    r.w.health.get(r.far)!.alive = false; carrySystem(r.w); expect(r.w.carried.has(r.foe)).toBe(false);
  });

  it("holds scheduled enemy effects but leaves the owner's sequence running", () => {
    const r = rig();
    const delay: EffectDef = { kind: "delayed", shape: "single", delaySec: 0.1, count: 2, intervalSec: 0.1, effects: [{ kind: "damage", damageType: "true", amount: { flat: 40, ratios: [] } }] };
    r.run(r.foe, [delay], [r.a]); r.run(r.a, [delay]); r.stop(); r.step(6);
    expect(r.w.delayed.find(w => w.caster === r.foe)?.next).toBe(0);
    expect([...r.w.timeStop.values()][0]!.hits.length).toBe(1);
    r.step(5); expect(r.w.delayed.find(w => w.caster === r.foe)?.next).toBe(1);
  });

  it("freezes enemy projectile position, range and collision while friendly missiles move", () => {
    const r = rig(), enemy = r.projectile(r.foe), friendly = r.projectile(r.a, -1);
    const pos = { ...r.w.transform.get(enemy)!.pos }, range = r.w.projectile.get(enemy)!.remainingRange;
    r.stop(); r.step(4);
    expect(r.w.transform.get(enemy)!.pos).toEqual(pos); expect(r.w.projectile.get(enemy)!.remainingRange).toBe(range);
    expect(r.w.projectile.get(friendly)!.remainingRange).toBeLessThan(30);
    r.step(3); expect(r.w.transform.get(enemy)!.pos.x).toBeGreaterThan(pos.x);
  });

  it("a fast missile stops at the field boundary instead of crossing it in one tick", () => {
    const r = rig(), id = r.projectile(r.foe, -10, 600); r.stop(); r.step();
    const offset = r.w.transform.get(id)!.pos.x - r.w.transform.get(r.a)!.pos.x;
    expect(offset).toBeCloseTo(-Math.sqrt(12), 7);
    const pos = { ...r.w.transform.get(id)!.pos }; r.step(3); expect(r.w.transform.get(id)!.pos).toEqual(pos);
  });

  it("queues ordered owner hits without HP, shield or damage hooks until expiry", () => {
    const r = rig(), hp = r.w.health.get(r.foe)!, before = hp.hp, field = r.stop();
    r.hit(r.a, r.foe, 100); r.hit(r.a, r.foe, 70);
    expect(hp.hp).toBe(before); expect(r.w.events.filter(e => e.type === "damage")).toHaveLength(0);
    expect(r.w.timeStop.get(field)!.hits.map(h => h.amount)).toEqual([100, 70]);
    r.step(6); expect(hp.hp).toBe(before); r.step();
    expect(hp.hp).toBeLessThan(before); expect(r.w.timeStop.size).toBe(0);
    expect(r.w.events.filter(e => e.type === "damage").map(e => e.data.raw)).toHaveLength(2);
  });

  it("queue overflow never becomes immediate damage and does not grow without bound", () => {
    const r = rig(), field = r.stop(r.a, 0.2, 2), hp = r.w.health.get(r.foe)!.hp;
    for (let i = 0; i < 10; i++) r.hit();
    expect(r.w.timeStop.get(field)!.hits).toHaveLength(2); expect(r.w.health.get(r.foe)!.hp).toBe(hp);
    expect(r.w.events.filter(e => e.type === "timeStopHitOverflow")).toHaveLength(8);
  });

  it("overlapping allied fields pause clocks once and never duplicate a hit", () => {
    const r = rig(); r.run(r.foe, [{ kind: "applyStatus", applyTo: "self", statusId: "fixture" as StatusId, duration: 1 }]);
    const s = r.w.status.get(r.foe)!.effects[0]!, expiry = s.expiresAtTick;
    r.stop(r.a, 0.1); r.stop(r.ally, 0.3); r.hit(); r.step(4);
    expect(s.expiresAtTick).toBe(expiry + 4); expect(isTimeStopped(r.w, r.foe)).toBe(true);
    expect([...r.w.timeStop.values()].flatMap(f => f.hits)).toHaveLength(0);
    expect(r.w.events.filter(e => e.type === "damage")).toHaveLength(1);
    r.step(6); expect(isTimeStopped(r.w, r.foe)).toBe(false);
  });

  it.each(["death", "destroy", "round", "zone", "settled"])("%s cancels the owner's field and pending hits", reason => {
    const r = rig(), hp = r.w.health.get(r.foe)!.hp; r.stop(); r.hit();
    if (reason === "death") r.w.health.get(r.a)!.alive = false;
    if (reason === "destroy") r.w.destroy(r.a);
    if (reason === "round") restoreForNextRound(r.w, r.a);
    if (reason === "zone") r.w.transform.get(r.a)!.zone = 1;
    if (reason === "settled") r.w.settledZones.add(0);
    timeStopSystem(r.w);
    expect(r.w.timeStop.size).toBe(0); expect(r.w.damageQueue).toHaveLength(0); expect(r.w.health.get(r.foe)!.hp).toBe(hp);
    expect(isTimeStopped(r.w, r.foe)).toBe(false);
  });

  it("a restored victim never inherits queued hits against its old life", () => {
    const r = rig(); r.stop(); r.hit(); restoreForNextRound(r.w, r.foe);
    expect([...r.w.timeStop.values()][0]!.hits).toHaveLength(0);
  });

  it("pending packets and field deadlines are replay-digested", () => {
    const a = rig(), b = rig(); a.stop(); b.stop(); expect(a.w.digest()).toBe(b.w.digest());
    a.hit(); expect(a.w.digest()).not.toBe(b.w.digest()); b.hit(); expect(a.w.digest()).toBe(b.w.digest());
    a.step(8); b.step(8); expect(a.w.digest()).toBe(b.w.digest());
  });

  it("opposing fields can overlap without freezing either field's expiry", () => {
    const r = rig(); r.w.transform.get(r.foe)!.pos.x += 8;
    r.stop(r.a, 0.2); r.stop(r.foe, 0.3);
    r.w.transform.get(r.a)!.pos.x += 8;
    r.w.transform.get(r.foe)!.pos.x -= 8;
    expect(isTimeStopped(r.w, r.a)).toBe(true); expect(isTimeStopped(r.w, r.foe)).toBe(true);
    r.step(7); expect(isTimeStopped(r.w, r.foe)).toBe(false); expect(isTimeStopped(r.w, r.a)).toBe(true);
    r.step(3); expect(r.w.timeStop.size).toBe(0);
  });

  it("the first lethal thawed hit kills once; remaining queued hits do not farm corpse hooks", () => {
    const r = rig(); r.stop(); r.w.health.get(r.foe)!.hp = 1;
    r.hit(); r.hit(); r.hit(); r.step(7);
    expect(r.w.health.get(r.foe)!.alive).toBe(false);
    expect(r.w.events.filter(e => e.type === "damage")).toHaveLength(1);
    expect(r.w.events.filter(e => e.type === "death")).toHaveLength(1);
  });

  it("death by an outside attacker cancels the field before its next scheduled expiry", () => {
    const r = rig(); r.stop(); r.hit(); r.w.health.get(r.a)!.hp = 1;
    r.w.damageQueue.push({ source: r.far, target: r.a, amount: 100, type: "true", crit: false, origin: "basic" });
    r.step(); expect(r.w.timeStop.size).toBe(0); expect(isTimeStopped(r.w, r.foe)).toBe(false);
    expect(r.w.events.filter(e => e.type === "damage" && e.data.target === r.foe)).toHaveLength(0);
  });
});
