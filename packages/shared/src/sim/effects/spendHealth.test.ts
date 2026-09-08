import { beforeAll, describe, expect, it } from "vitest";
import { zEffectDef } from "../../content/schema/effects";
import { zAbilityDoc } from "../../content/schema/ability";
import { asSeatId, asTeamId, type ChampionId, type StatusId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import type { AbilityDef } from "../content/defs";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { castAbility } from "../abilities/abilitySystem";
import { installMark } from "../marks";
import { runEffects, bakeCastTimeConditionals } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";

const HERO = "fixture-health-payment" as ChampionId;
const ENERGY = "fixture-health-payment.energy" as StatusId;
const payment: EffectDef = { kind: "spendHealth", amount: { flat: 0 }, pctMaxHealth: 0.03 };
const Q = zAbilityDoc.parse({ schema: "ability@1", id: `${HERO}.q`, name: "release payment",
  slot: "Q", castType: "targeted", maxRank: 1, range: 30, cooldown: [5], manaCost: [20],
  castTimeSec: 0.8, recoverySec: 0, effects: [payment,
    { kind: "damage", damageType: "true", amount: { flat: 70 } }],
}) as AbilityDef;

beforeAll(() => {
  registerSkeletonContent();
  registerChampion({ ...SELA, id: HERO, passive: undefined, abilities: { ...SELA.abilities, Q } });
});

function rig() {
  const world = new SimWorld(SKELETON_ARENA, 37);
  const center = SKELETON_ARENA.zones[0]!.center;
  const [caster, target] = [0, 1].map(seat => spawnChampion(world, { zone: 0, championId: HERO,
    seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: center.x + seat, z: center.z + 10 } }));
  for (const id of [caster!, target!]) {
    attachSource(world, id, { id: "fixture-no-regen", kind: "item", modifiers: [
      { stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 },
    ] });
    recomputeStats(world, id);
  }
  const hp = world.health.get(caster!)!;
  hp.maxHp = 1000; hp.hp = 500;
  world.abilities.get(caster!)!.slots.Q.rank = 1;
  const context: EffectContext = { world, caster: caster!, targets: [target!], rank: 1,
    origin: "ability:fixture-health-payment.q", rng: world.rng };
  const run = (e: EffectDef = payment, ctx = context) => runEffects([zEffectDef.parse(e) as EffectDef], ctx);
  const step = () => world.step(new Map());
  const cast = () => castAbility(world, caster!, "Q", { type: "entity", entityId: target! });
  const paid = () => world.events.filter(e => e.type === "healthSpend").map(e => e.data);
  return { world, caster: caster!, target: target!, hp, context, run, step, cast, paid };
}

describe("nonlethal life payment", () => {
  it("pays the caster once, regardless of missing or duplicate affected targets", () => {
    for (const selection of ["none", "many"] as const) {
      const r = rig(); const foeHp = r.world.health.get(r.target)!.hp;
      r.run(payment, { ...r.context, targets: selection === "none" ? [] : [r.target, r.target, r.caster] });
      expect(r.hp.hp).toBe(470); expect(r.world.health.get(r.target)!.hp).toBe(foeHp);
      expect(r.paid()).toEqual([{ source: r.caster, target: r.caster, amount: 30, remaining: 470,
        origin: r.context.origin }]);
      r.step(); expect(r.hp.hp).toBe(470); expect(r.hp.alive).toBe(true);
    }
  });

  it.each([1, 0.5, 5, 30])("at %s HP, preserves life without healing or reporting a fictitious payment", start => {
    const r = rig(); r.hp.hp = start; r.run();
    const expected = Math.min(start, 1);
    expect(r.hp.hp).toBe(expected); expect(r.hp.alive).toBe(true);
    expect(r.paid()).toHaveLength(start > 1 ? 1 : 0);
    if (start > 1) expect(r.paid()[0]!.amount).toBe(start - 1);
    r.run(); expect(r.hp.hp).toBe(expected);
    r.step(); expect(r.hp.alive).toBe(true); expect(r.hp.hp).toBe(expected);
  });

  it("supports a higher floor and additive flat, maximum and current health terms by rank", () => {
    const r = rig(); r.run({ kind: "spendHealth", amount: { perRank: [10, 20] },
      pctMaxHealth: [0.01, 0.02], pctCurrentHealth: [0.1, 0.2], minimumHp: 400 },
      { ...r.context, rank: 2 });
    expect(r.hp.hp).toBe(400); expect(r.paid()[0]!.amount).toBe(100);
    r.hp.hp = 200; r.run({ ...payment, minimumHp: 400 }); expect(r.hp.hp).toBe(200);
  });

  it("ignores shields, immunity and damage/healing multipliers; cannot feed damage hooks or lifesteal", () => {
    const r = rig();
    installMark(r.world, r.caster, { markId: ENERGY, initial: 0, max: 3, durationSec: -1, resetOn: "never" });
    attachSource(r.world, r.caster, { id: "fixture-damage-procs", kind: "item", modifiers: [
      { stat: Stat.Lifesteal, op: ModOp.Flat, value: 1 },
      { stat: Stat.SpellVamp, op: ModOp.Flat, value: 0.8 },
    ], hooks: ["onDamageTaken", "onDamageDealt"].map(on => ({
      on: on as "onDamageTaken" | "onDamageDealt", target: "self" as const,
      effects: [{ kind: "heal" as const, amount: { flat: 200 } }],
    })) });
    recomputeStats(r.world, r.caster);
    // Recompute stats updates maxHp; isolate the payment's intended denominator.
    r.hp.maxHp = 1000; r.hp.hp = 500;
    r.world.combatEnv = { ...r.world.combatEnv, damageDealt: 7, healing: 4 };
    runEffects([{ kind: "shield", amount: { flat: 900 }, duration: 3 },
      { kind: "invulnerable", durationSec: 3 }], { ...r.context, targets: [r.caster] });
    const shields = JSON.stringify(r.hp.shields);
    r.run(); expect(r.hp.hp).toBe(470); expect(r.world.damageQueue).toHaveLength(0);
    expect(JSON.stringify(r.hp.shields)).toBe(shields);
    r.step(); expect(r.hp.hp).toBe(470); expect(r.hp.alive).toBe(true);
    expect(r.world.marks.get(r.caster)!.get(ENERGY)!.count).toBe(0);
    expect(r.world.events.filter(e => ["damage", "heal", "death", "reflectSuccess"].includes(e.type))).toEqual([]);
  });

  it("does nothing to dead or missing bodies", () => {
    const r = rig(); r.hp.hp = 0; r.hp.alive = false; r.run();
    expect(r.hp.hp).toBe(0); expect(r.paid()).toEqual([]);
    r.world.health.delete(r.caster); expect(() => r.run()).not.toThrow();
  });

  it("uses live health when a baked payload executes, with authored list order", () => {
    const r = rig(); const baked = bakeCastTimeConditionals([payment], r.context);
    expect(r.hp.hp).toBe(500);
    r.hp.maxHp = 2000; runEffects(baked, r.context);
    expect(r.hp.hp).toBe(440);
    r.hp.maxHp = 1000;
    runEffects([{ kind: "heal", amount: { flat: 100 }, applyTo: "self" },
      { kind: "spendHealth", amount: { flat: 0 }, pctCurrentHealth: 0.5 }], r.context);
    expect(r.hp.hp).toBe(270);
  });

  it("respects the existing condition gate and the live health state changes replay digest", () => {
    const r = rig(); const before = r.world.digest();
    r.run({ ...payment, condition: { kind: "stat", subject: "self", stat: "hp", mode: "absolute", op: ">", value: 900 } });
    expect(r.hp.hp).toBe(500); expect(r.world.digest()).toBe(before);
    r.run(); expect(r.world.digest()).not.toBe(before);
  });
});

describe("life payment at channel release", () => {
  it("a real 0.8 second cast pays only on release, then hits the opponent", () => {
    const r = rig(); const before = r.world.health.get(r.target)!.hp;
    expect(r.cast()).toBe("ok"); expect(r.hp.hp).toBe(500);
    const ticks = r.world.abilities.get(r.caster)!.cast!.ticksLeft;
    for (let i = 1; i < ticks; i++) { r.step(); expect(r.hp.hp).toBe(500); }
    r.step(); expect(r.hp.hp).toBe(470); expect(r.paid()[0]!.amount).toBe(30);
    expect(r.world.health.get(r.target)!.hp).toBeLessThan(before);
    for (let i = 0; i < 5; i++) r.step(); expect(r.hp.hp).toBe(470);
  });

  it("interruption retains the cast-start mana cost but never pays unreleased recoil", () => {
    const r = rig(); const mana = r.hp.mana; const before = r.world.health.get(r.target)!.hp;
    expect(r.cast()).toBe("ok");
    r.world.status.get(r.caster)!.effects.push({ sourceId: "fixture-stun", statusId: "fixture-stun" as StatusId,
      expiresAtTick: r.world.tick + 60, stun: true });
    r.step(); expect(r.world.abilities.get(r.caster)!.cast).toBeNull();
    expect(r.hp.hp).toBe(500); expect(r.hp.mana).toBeLessThan(mana);
    expect(r.paid()).toEqual([]); expect(r.world.health.get(r.target)!.hp).toBe(before);
  });
});

describe("life payment schema", () => {
  it.each([
    { pctMaxHealth: 3 }, { pctCurrentHealth: -0.1 }, { pctMaxHealth: [] },
    { pctCurrentHealth: [0.03, 2] }, { minimumHp: 0 }, { minimumHp: Infinity },
    { applyTo: "target" },
  ])("rejects unsafe or misleading fields %j", fields => {
    expect(zEffectDef.safeParse({ ...payment, ...fields }).success).toBe(false);
  });
});
