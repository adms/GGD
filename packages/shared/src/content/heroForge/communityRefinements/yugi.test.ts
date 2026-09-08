import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { ownedSummonsForSlot } from "../../../sim/summons";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { basicAttackSystem } from "../../../sim/systems/BasicAttackSystem";
import { combatResolveSystem } from "../../../sim/combat/damage";
import { interceptTrapAttack, trapSystem } from "../../../sim/traps";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { zEffectDef } from "../../schema/effects";
import { zHookDef } from "../../schema/effects/_hook";
import type { EntityId, StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityCombatFixture("01", rank), prefix = r.project.projectId;
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 }, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [
      { stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 },
      { stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }, { stat: Stat.ManaRegen, op: ModOp.Override, value: 0 }] });
    recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  }
  const start = { ...r.world.transform.get(r.caster)!.pos };
  const events: typeof r.world.events = [];
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = { x: start.x + x, z: start.z + z }; r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.ally, -2); place(r.enemy, 3); place(r.distant, -15);
  r.world.combatActive = true;
  const step = (n = 12) => { for (let i = 0; i < n; i++) { for (const ab of r.world.abilities.values()) { ab.basicAttackCdTicks = 10000; ab.windup = null; } r.world.step(new Map()); events.push(...r.world.events); } };
  const count = (id = r.caster) => r.world.marks.get(id)!.get(`${prefix}.layout` as StatusId)!.count;
  const setCount = (n: number) => { r.world.marks.get(r.caster)!.get(`${prefix}.layout` as StatusId)!.count = n; };
  const cast = (slot: CastableSlot, ticks = 4, caster = r.caster, target = r.enemy) => {
    const input = slot === "Q" || slot === "W" ? { type: "entity" as const, entityId: target } : { type: "point" as const, point: { ...r.world.transform.get(target)!.pos } };
    const result = castAbility(r.world, caster, slot, input); if (result === "ok") step(ticks); return result;
  };
  const ready = (slot: CastableSlot, caster = r.caster) => { abilityInstanceFor(r.world.abilities.get(caster)!, slot)!.cooldownRemainingTicks = 0; };
  const damage = (source: EntityId, target = r.enemy, amount = 10, origin = "basic") => {
    r.world.damageQueue.push({ source, target, amount, type: "magic", origin, crit: false }); combatResolveSystem(r.world);
    events.push(...r.world.events); r.world.events.length = 0;
  };
  const summon = (slot: "Q" | "W", owner = r.caster) => {
    expect(cast(slot, 4, owner)).toBe("ok");
    const id = ownedSummonsForSlot(r.world, owner, slot)[0]!; expect(id).toBeDefined();
    // Keep direct damage assertions separate from autonomous combat.
    r.world.abilities.get(id)!.basicAttackCdTicks = 10000;
    attachSource(r.world, id, { id: "test:no-regen", kind: "item", modifiers: [{ stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }] }); recomputeStats(r.world, id);
    return id;
  };
  const effects = (list: EffectDef[], target = r.caster, caster = r.caster) => runEffects(list, {
    world: r.world, caster, targets: [target], point: { ...r.world.transform.get(target)!.pos }, rank: 1, origin: "test:effect", rng: r.world.rng,
  });
  const attack = (source = r.enemy, target = r.caster) => {
    r.world.abilities.get(source)!.windup = { target, ticksLeft: 1 };
    basicAttackSystem(r.world);
  };
  const trap = () => { expect(cast("E", 14)).toBe("ok"); expect(r.world.trap.size).toBe(1); return [...r.world.trap.keys()][0]!; };
  const hits = (slot: string) => events.filter(e => e.type === "damage" && e.data.origin === `ability:${prefix}.${slot.toLowerCase()}`);
  step(1);
  return { ...r, prefix, step, events, place, cast, ready, count, setCount, damage, summon, effects, attack, trap, hits };
}

describe("#1132 武藤遊戲 — versioned six-slot source mechanics", () => {
  it("preserves original text, names and model evidence while regenerating independent effects", () => {
    const r = setup(); expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.brief).toEqual(r.source.project.brief);
    expect(r.project.presentation.modelKey).toEqual(r.source.project.presentation.modelKey);
    expect(r.project.receipts).toEqual([]);
    for (const slot of ["PASSIVE", "Q", "W", "E", "R", "EX"] as const) expect(r.compiled.abilityDrafts[slot].name).toBe(r.source.project.acceptedPlan!.slots[slot].name);
    expect(r.compiled.abilityDrafts.EX.requiredSummonSlot).toBe("Q");
    expect(r.compiled.abilityDrafts.E.effects[0]!.kind).toBe("trap");
  });
  it("Q and W have separate attackable bodies, owners, target orders and caps", () => {
    const r = setup(), q = r.summon("Q"), w = r.summon("W");
    expect(q).not.toBe(w); expect(r.world.summon.size).toBe(2);
    for (const id of [q, w]) {
      expect(r.world.health.get(id)!.maxHp).toBeGreaterThan(0);
      expect(r.world.summon.get(id)!.ownerId).toBe(r.caster);
      expect(r.world.nav.get(id)!.attackTarget).toBe(r.enemy);
    }
    r.damage(r.enemy, q, 1e8); r.step(1);
    expect(r.world.summon.has(q)).toBe(false); expect(r.world.summon.has(w)).toBe(true);
    expect(r.events.some(e => e.type === "death" && e.data.id === q)).toBe(true);
    expect(r.events.some(e => e.type === "summonDespawn" && e.data.id === q && e.data.reason === "death")).toBe(true);
  });
  it("autonomous summon projectiles report actual damage to the owner's once-per-cast hook", () => {
    const r = setup(), q = r.summon("Q"); r.place(q, 1);
    r.world.abilities.get(q)!.basicAttackCdTicks = 0;
    const hp = r.world.health.get(r.enemy)!.hp;
    for (let n = 0; n < 100; n++) { r.world.step(new Map()); r.events.push(...r.world.events); }
    expect(r.events.some(e => e.type === "projectileSpawn" && e.data.owner === q)).toBe(true);
    expect(r.world.health.get(r.enemy)!.hp).toBeLessThan(hp); expect(r.count()).toBe(1);
  });
  it("recast retargets the same body without healing, new layout credit or lifetime refresh", () => {
    const r = setup(), q = r.summon("Q"), sm = r.world.summon.get(q)!;
    r.damage(q); expect(r.count()).toBe(1);
    const hp = r.world.health.get(q)!; hp.hp -= 20;
    const health = hp.hp, expiry = sm.expiresAtTick, credit = sm.castInstance;
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 4, 2);
    r.ready("Q"); expect(r.cast("Q", 4, r.caster, r.distant)).toBe("ok");
    expect(ownedSummonsForSlot(r.world, r.caster, "Q")).toEqual([q]);
    expect(r.world.nav.get(q)!.attackTarget).toBe(r.distant);
    expect(sm.expiresAtTick).toBe(expiry); expect(sm.castInstance).toBe(credit); expect(hp.hp).toBe(health);
    r.damage(q, r.distant); expect(r.count()).toBe(1);
  });
  it("each summon cast earns one layout across hits and targets; capped at three", () => {
    const r = setup(), q = r.summon("Q"), w = r.summon("W");
    r.damage(q); r.damage(q); expect(r.count()).toBe(1); r.damage(w); expect(r.count()).toBe(2);
    r.world.health.get(q)!.alive = false; r.step(1); r.ready("Q"); const next = r.summon("Q");
    r.damage(next); expect(r.count()).toBe(3); r.damage(next); expect(r.count()).toBe(3);
  });
  it("shield absorption is a real summon hit; immune, zero, friendly and owner hits are not", () => {
    const r = setup(), q = r.summon("Q");
    r.damage(q, r.ally); r.damage(r.caster); r.damage(q, r.enemy, 0); expect(r.count()).toBe(0);
    r.effects([{ kind: "invulnerable", durationSec: 1, applyTo: "target" }], r.enemy);
    r.damage(q); expect(r.count()).toBe(0); r.world.invulnerable.delete(r.enemy);
    r.effects([{ kind: "shield", amount: { flat: 100 }, duration: 5 }], r.enemy);
    const hp = r.world.health.get(r.enemy)!.hp; r.damage(q);
    expect(r.world.health.get(r.enemy)!.hp).toBe(hp); expect(r.count()).toBe(1);
  });
  it.each([false, true])("cooperation recognizes either hit order and shares one cooldown: reverse=%s", reverse => {
    const r = setup(), q = r.summon("Q"), w = r.summon("W");
    r.world.events.length = 0; r.events.length = 0;
    const hp = r.world.health.get(r.enemy)!.hp;
    r.damage(reverse ? w : q); const first = hp - r.world.health.get(r.enemy)!.hp;
    r.damage(reverse ? q : w); const both = hp - r.world.health.get(r.enemy)!.hp;
    expect(both).toBeGreaterThan(first * 2);
    const after = r.world.health.get(r.enemy)!.hp; r.damage(q); r.damage(w);
    expect(after - r.world.health.get(r.enemy)!.hp).toBeCloseTo(first * 2);
    expect(r.count()).toBe(2);
  });
  it("cooperation does not combine different victims, owners or an expired hit window", () => {
    const r = setup(), q = r.summon("Q"), w = r.summon("W"), foreignW = r.summon("W", r.ally);
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 4, 2);
    const hp = r.world.health.get(r.enemy)!.hp; r.damage(q); const hit = hp - r.world.health.get(r.enemy)!.hp;
    r.damage(w, r.distant); r.damage(foreignW); expect(hp - r.world.health.get(r.enemy)!.hp).toBeCloseTo(hit * 2);
    r.world.tick += 31; r.damage(w); expect(hp - r.world.health.get(r.enemy)!.hp).toBeCloseTo(hit * 3);
  });
  it("owner death removes both summons and trap; no posthumous layout", () => {
    const r = setup(), q = r.summon("Q"); r.summon("W"); r.trap();
    r.world.health.get(r.caster)!.alive = false; r.damage(q); expect(r.count()).toBe(0);
    r.step(1); expect(r.world.summon.size).toBe(0); expect(r.world.trap.size).toBe(0);
  });
  it("E is stationary, intercepts a real ranged attack without a projectile, counters its source once", () => {
    const r = setup(), id = r.trap(), position = { ...r.world.transform.get(id)!.pos };
    r.place(r.caster, -1); expect(r.world.transform.get(id)!.pos).toEqual(position);
    const hp = r.world.health.get(r.caster)!.hp, enemyHp = r.world.health.get(r.enemy)!.hp;
    r.attack(); combatResolveSystem(r.world);
    expect(r.world.trap.size).toBe(0); expect(r.world.projectile.size).toBe(0);
    expect(r.world.health.get(r.caster)!.hp).toBe(hp); expect(r.world.health.get(r.enemy)!.hp).toBeLessThan(enemyHp); expect(r.count()).toBe(1);
    expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(false); expect(r.count()).toBe(1);
  });
  it("E allows attacks while arming or outside range and never intercepts spells", () => {
    const r = setup(); expect(r.cast("E", 4)).toBe("ok");
    expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(false);
    r.world.tick += 10; r.place(r.enemy, 7); expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(false);
    r.place(r.enemy, 3); r.damage(r.enemy, r.caster, 10, "ability:test-spell"); expect(r.world.trap.size).toBe(1); expect(r.count()).toBe(0);
    expect(interceptTrapAttack(r.world, r.enemy, r.ally)).toBe(true); expect(r.count()).toBe(1);
  });
  it("trap rejects friendly, dead and cross-zone attacks, and expires with no reward", () => {
    const r = setup(); r.trap();
    expect(interceptTrapAttack(r.world, r.ally, r.caster)).toBe(false);
    r.world.health.get(r.enemy)!.alive = false; expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(false); r.world.health.get(r.enemy)!.alive = true;
    r.world.transform.get(r.enemy)!.zone = 1; expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(false);
    r.world.tick += 300; trapSystem(r.world); expect(r.world.trap.size).toBe(0); expect(r.count()).toBe(0);
  });
  it("replacement and two colocated owners keep one activation per attack and isolated credit", () => {
    const r = setup(), first = r.trap(); r.ready("E"); const second = r.trap(); expect(second).not.toBe(first); expect(r.world.transform.has(first)).toBe(false);
    expect(r.cast("E", 14, r.ally)).toBe("ok"); expect(r.world.trap.size).toBe(2);
    expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(true);
    expect(r.world.trap.size).toBe(1); expect(r.count()).toBe(1); expect(r.count(r.ally)).toBe(0);
    expect(interceptTrapAttack(r.world, r.enemy, r.caster)).toBe(true); expect(r.count(r.ally)).toBe(1);
  });
  it("R warns before a one-shot area resolution and adds no persistent body", () => {
    const r = setup(); expect(r.cast("R", 4)).toBe("ok"); expect(r.hits("R")).toHaveLength(0);
    expect(r.world.delayed).toHaveLength(1); r.step(23);
    expect(r.hits("R")).toHaveLength(1); expect(r.world.summon.size).toBe(0); expect(r.count()).toBe(0);
    r.step(30); expect(r.hits("R")).toHaveLength(1);
  });
  it("R re-resolves after warning so moving outside evades the strike", () => {
    const r = setup(); r.cast("R", 4); r.place(r.enemy, 8); r.step(25); expect(r.hits("R")).toHaveLength(0);
  });
  it("EX rejects missing Q before payment, including another owner's Q and own W", () => {
    const r = setup(); r.setCount(3); const hp = r.world.health.get(r.caster)!, mana = hp.mana;
    expect(r.cast("EX", 0)).toBe("no-summon"); expect(r.count()).toBe(3); expect(hp.mana).toBe(mana);
    r.summon("Q", r.ally); r.summon("W"); expect(r.cast("EX", 0)).toBe("no-summon"); expect(r.count()).toBe(3);
  });
  it("EX starts at Q, uses owner damage attribution, consumes all layout and hits each enemy once", () => {
    const r = setup(), q = r.summon("Q"); r.place(q, 0, 3); r.place(r.enemy, 3, 3); r.setCount(3);
    expect(castAbility(r.world, r.caster, "EX", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok"); expect(r.count()).toBe(0); r.step(12);
    const line = r.events.find(e => e.type === "damageLine")!;
    expect(line).toBeDefined(); expect(line.data.z).toBeCloseTo(r.world.transform.get(q)!.pos.z);
    expect(r.hits("EX")).toHaveLength(1); expect(r.hits("EX")[0]!.data.source).toBe(r.caster);
    r.ready("EX"); expect(r.cast("EX", 0)).toBe("no-resource");
  });
  it("EX fizzles without fallback or refund when Q dies during windup", () => {
    const r = setup(), q = r.summon("Q"); r.setCount(2); expect(r.cast("EX", 0)).toBe("ok");
    r.damage(r.enemy, q, 1e8); r.step(12); expect(r.count()).toBe(0); expect(r.hits("EX")).toHaveLength(0);
    expect(r.events.some(e => e.type === "damageLine")).toBe(false);
  });
  it("trap state and summon emission slot participate in deterministic digests", () => {
    const r = setup(), id = r.trap(), digest = r.world.digest(); r.world.trap.get(id)!.cancelAttack = false;
    expect(r.world.digest()).not.toBe(digest); r.world.trap.get(id)!.cancelAttack = true; expect(r.world.digest()).toBe(digest);
    const q = r.summon("Q"), summonDigest = r.world.digest(); r.world.summon.get(q)!.slot = "W"; expect(r.world.digest()).not.toBe(summonDigest);
  });
  it("schema rejects impossible trap timing and conflicting emitter origins", () => {
    expect(zEffectDef.safeParse({ kind: "trap", radius: 2, durationSec: 1, armDelaySec: 1, onTrigger: [{ kind: "damage", amount: { flat: 10 } }] }).success).toBe(false);
    expect(zEffectDef.safeParse({ kind: "damageLine", length: 5, width: 1, amount: { flat: 10 }, fromCaster: false, fromSummonSlot: "Q" }).success).toBe(false);
    expect(zHookDef.safeParse({ on: "onSummonHit", damageSource: "basic", oncePerCast: true, effects: [{ kind: "damage", amount: { flat: 10 } }] }).success).toBe(true);
  });
});
