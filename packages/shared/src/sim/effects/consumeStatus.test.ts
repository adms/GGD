import { beforeAll, describe, expect, it } from "vitest";
import { zEffectDef } from "../../content/schema/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { adjustMarkCount, installMark } from "../marks";
import { clearPools } from "../clearPools";
import { consumableStatusStacks, consumeStatusStacks } from "../statusConsumption";
import { bakeCastTimeConditionals, runEffects } from "./effectRunner";
import { hasStatus, statusStacks } from "./effectCommon";
import type { EffectContext, EffectDef } from "./effect";

beforeAll(() => registerSkeletonContent());
const CURSE = "fixture-r-curse" as StatusId;
const ENERGY = "fixture-energy" as StatusId;
const BOON = "fixture-reversed-curse" as StatusId;
const DEBUFF = "fixture-clean-ex" as StatusId;
const parse = (e: unknown) => zEffectDef.parse(e) as EffectDef;
const mods = (value: number) => [
  { stat: Stat.AttackDamage, op: ModOp.PercentAdd, value },
  { stat: Stat.AbilityPower, op: ModOp.PercentAdd, value },
];
const curse = parse({ kind: "applyBuff", sourceScope: "caster", statusId: CURSE,
  stackKey: "r-curse", maxStacks: 1, duration: 4, modifiers: mods(-0.15), dispellable: true });
const reversal = parse({ kind: "consumeStatus", shape: "single", statusId: CURSE,
  count: "all", appliedBy: "self",
  onConsumed: [{ kind: "applyBuff", sourceScope: "caster", statusId: BOON,
    stackKey: "reversal", maxStacks: 1, duration: 2, modifiers: mods(0.10) }],
  onMissing: [
    { kind: "damage", damageType: "true", amount: { flat: 70 } },
    { kind: "applyBuff", sourceScope: "caster", statusId: DEBUFF,
      stackKey: "clean-ex", maxStacks: 1, duration: 2, modifiers: mods(-0.20) },
  ],
});

function rig() {
  const world = new SimWorld(SKELETON_ARENA, 17);
  const centre = SKELETON_ARENA.zones[0]!.center;
  const [a, b, foe, other] = [0, 1, 2, 3].map(seat => spawnChampion(world, {
    zone: 0, championId: SELA.id as ChampionId, seatId: asSeatId(seat),
    teamId: asTeamId(seat < 2 ? 0 : 1), pos: { x: centre.x + seat * 0.4, z: centre.z + 10 },
  })) as [EntityId, EntityId, EntityId, EntityId];
  for (const id of [a, b, foe, other]) {
    attachSource(world, id, { id: "fixture-regen-off", kind: "item", modifiers: [
      { stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 },
      { stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 },
    ] });
    recomputeStats(world, id);
  }
  const context = (caster = a, targets = [foe]): EffectContext => ({
    world, caster, rank: 1, targets, origin: "same-ability", rng: world.rng,
  });
  const run = (e: EffectDef, caster = a, targets = [foe]) => runEffects([parse(e)], context(caster, targets));
  const step = () => world.step(new Map());
  const ad = () => { recomputeStats(world, foe); return world.stats.get(foe)!.final.ad; };
  return { world, a, b, foe, other, context, run, step, ad };
}

describe("atomic status consumption and curse reversal", () => {
  it("R then EX removes the caster's curse and buffs the enemy without the ordinary EX damage", () => {
    const r = rig(); const base = r.ad(); const hp = r.world.health.get(r.foe)!.hp;
    const baseAp = r.world.stats.get(r.foe)!.final.ap;
    r.run(curse); expect(r.ad()).toBeLessThan(base);
    expect(r.world.stats.get(r.foe)!.final.ap).toBeLessThan(baseAp);
    r.run(reversal); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBe(hp);
    expect(r.ad()).toBeGreaterThan(base);
    expect(r.world.stats.get(r.foe)!.final.ap).toBeGreaterThan(baseAp);
    expect(hasStatus(r.world, r.foe, CURSE, r.a)).toBe(false);
    expect(hasStatus(r.world, r.foe, BOON, r.a)).toBe(true);
    expect(hasStatus(r.world, r.foe, DEBUFF)).toBe(false);
  });

  it.each(["clean", "cleansed", "expired"] as const)("%s target takes only the ordinary EX branch", state => {
    const r = rig(); const base = r.ad(); const hp = r.world.health.get(r.foe)!.hp;
    if (state !== "clean") r.run(curse);
    if (state === "cleansed") clearPools(r.world, r.foe, {
      pools: { buffs: true }, polarity: "debuff", requireDispellable: true,
    });
    if (state === "expired") r.world.tick = r.world.stats.get(r.foe)!.sources.find(s => s.statusId === CURSE)!.expiresAtTick!;
    r.run(reversal); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBeLessThan(hp);
    expect(r.ad()).toBeLessThan(base);
    expect(hasStatus(r.world, r.foe, BOON)).toBe(false);
    expect(hasStatus(r.world, r.foe, DEBUFF, r.a)).toBe(true);
  });

  it("two casters interleave in the same tick without consuming each other's R or running both branches", () => {
    const r = rig(); const hp = r.world.health.get(r.foe)!.hp;
    r.run(curse, r.a); r.run(curse, r.b);
    r.run(reversal, r.a);
    expect(hasStatus(r.world, r.foe, CURSE, r.a)).toBe(false);
    expect(hasStatus(r.world, r.foe, CURSE, r.b)).toBe(true);
    r.run(reversal, r.b); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBe(hp);
    expect(hasStatus(r.world, r.foe, BOON, r.a)).toBe(true);
    expect(hasStatus(r.world, r.foe, BOON, r.b)).toBe(true);
    expect(hasStatus(r.world, r.foe, DEBUFF)).toBe(false);
  });

  it("another caster's curse is not enough to trigger the reversal", () => {
    const r = rig(); const hp = r.world.health.get(r.foe)!.hp;
    r.run(curse, r.b); r.run(reversal, r.a); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBeLessThan(hp);
    expect(hasStatus(r.world, r.foe, CURSE, r.b)).toBe(true);
    expect(hasStatus(r.world, r.foe, BOON)).toBe(false);
  });

  it("control immunity does not erase an existing attribute curse or change the reversal branch", () => {
    const r = rig(); r.run(curse);
    r.run(parse({ kind: "invulnerable", durationSec: 3, blocksDamage: "none", blocksControl: true, applyTo: "target" }));
    const hp = r.world.health.get(r.foe)!.hp;
    r.run(reversal); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBe(hp);
    expect(hasStatus(r.world, r.foe, BOON, r.a)).toBe(true);
  });

  it("circle geometry selects real nearby enemies and leaves an outside curse alone", () => {
    const r = rig(); r.run(curse, r.a, [r.foe, r.other]);
    r.world.transform.get(r.other)!.pos.x += 10; r.world.rebuildGrid();
    r.run(parse({ ...reversal, shape: "circle", radius: 2, side: "enemies" })); r.step();
    expect(hasStatus(r.world, r.foe, BOON, r.a)).toBe(true);
    expect(hasStatus(r.world, r.other, CURSE, r.a)).toBe(true);
    expect(hasStatus(r.world, r.other, BOON)).toBe(false);
  });

  it("an insufficient debit changes neither partial layers nor modifiers", () => {
    const r = rig(); r.run(curse);
    const before = r.ad();
    const e = parse({ kind: "consumeStatus", shape: "single", statusId: CURSE, count: 2,
      onConsumed: [{ kind: "damage", damageType: "true", amount: { flat: 99 } }] });
    const hp = r.world.health.get(r.foe)!.hp;
    r.run(e); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBe(hp);
    expect(r.ad()).toBe(before);
    expect(statusStacks(r.world, r.foe, CURSE)).toBe(1);
  });

  it("self resource debit happens once, keeps all targets, and preserves refill and perStackLost", () => {
    const r = rig();
    installMark(r.world, r.a, { markId: ENERGY, initial: 3, max: 3, durationSec: -1, resetOn: "never",
      perStackLost: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 2 }] });
    const attack = r.world.stats.get(r.a)!.final.ad;
    const e = parse({ kind: "consumeStatus", shape: "single", subject: "self", statusId: ENERGY,
      count: 3, onConsumed: [{ kind: "damage", damageType: "true", amount: { flat: 50 } }] });
    const health = [r.foe, r.other].map(id => r.world.health.get(id)!.hp);
    r.run(e, r.a, [r.foe, r.other]); r.step();
    [r.foe, r.other].forEach((id, i) => expect(r.world.health.get(id)!.hp).toBeLessThan(health[i]!));
    expect(r.world.marks.get(r.a)!.get(ENERGY)).toMatchObject({ count: 0, spent: 3 });
    expect(r.world.stats.get(r.a)!.final.ad).toBeGreaterThan(attack);
    expect(adjustMarkCount(r.world, r.a, ENERGY, 2)).toBe(2);
  });

  it("target branches are independent and duplicate target ids cannot spend twice", () => {
    const r = rig(); r.run(curse, r.a, [r.foe]);
    const hp = r.world.health.get(r.foe)!.hp;
    const otherHp = r.world.health.get(r.other)!.hp;
    r.run(reversal, r.a, [r.foe, r.foe, r.other]); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBe(hp);
    expect(r.world.health.get(r.other)!.hp).toBeLessThan(otherHp);
  });

  it("consumes earliest-expiring layers across pools while leaving other ids and owners intact", () => {
    const r = rig();
    r.run(parse({ kind: "applyStatus", statusId: ENERGY, duration: 1, stacks: 2 }));
    installMark(r.world, r.foe, { markId: ENERGY, initial: 3, max: 3, durationSec: -1, resetOn: "never" });
    r.run(parse({ ...curse, statusId: ENERGY, duration: 2 }));
    r.run(curse, r.b);
    expect(consumeStatusStacks(r.world, r.foe, ENERGY, 4)).toBe(4);
    expect(statusStacks(r.world, r.foe, ENERGY)).toBe(2);
    expect(r.world.marks.get(r.foe)!.get(ENERGY)!.count).toBe(2);
    expect(hasStatus(r.world, r.foe, CURSE, r.b)).toBe(true);
    expect(consumeStatusStacks(r.world, r.foe, ENERGY, "all", r.a)).toBe(0);
  });

  it("partial buff consumption updates real stats without removing the remaining stack", () => {
    const r = rig(); const base = r.ad(); r.run(curse);
    const s = r.world.stats.get(r.foe)!.sources.find(s => s.statusId === CURSE)!;
    s.stacks = 3; r.world.stats.get(r.foe)!.dirty = true;
    const before = r.ad();
    expect(consumeStatusStacks(r.world, r.foe, CURSE, 2, r.a)).toBe(2);
    r.step();
    expect(statusStacks(r.world, r.foe, CURSE, r.a)).toBe(1);
    expect(r.ad()).toBeGreaterThan(before); expect(r.ad()).toBeLessThan(base);
  });

  it("exact-instance removal cannot detach an expired same-id source instead", () => {
    const r = rig(); r.run(curse);
    const live = r.world.stats.get(r.foe)!.sources.find(s => s.statusId === CURSE)!;
    const expired = { ...live, expiresAtTick: r.world.tick };
    r.world.stats.get(r.foe)!.sources.unshift(expired);
    expect(consumeStatusStacks(r.world, r.foe, CURSE, 1, r.a)).toBe(1);
    expect(r.world.stats.get(r.foe)!.sources).not.toContain(live);
    expect(r.world.stats.get(r.foe)!.sources).toContain(expired);
  });

  it("a buff above the named-counter cap retains its true remainder", () => {
    const r = rig(); r.run(curse);
    const source = r.world.stats.get(r.foe)!.sources.find(s => s.statusId === CURSE)!;
    source.stacks = 1001;
    expect(consumeStatusStacks(r.world, r.foe, CURSE, 999)).toBe(999);
    expect(source.stacks).toBe(2);
    expect(consumeStatusStacks(r.world, r.foe, CURSE, "all")).toBe(2);
  });

  it("does not destroy equipment, passives, or aura owners even if they carry the same status id", () => {
    const r = rig();
    for (const kind of ["item", "passive", "aura"] as const) attachSource(r.world, r.foe, {
      id: `fixture-${kind}`, kind, statusId: ENERGY, modifiers: [],
    });
    expect(consumableStatusStacks(r.world, r.foe, ENERGY)).toBe(0);
    expect(consumeStatusStacks(r.world, r.foe, ENERGY, "all")).toBe(0);
    expect(r.world.stats.get(r.foe)!.sources.filter(s => s.statusId === ENERGY)).toHaveLength(3);
  });

  it("all removes the whole count above the display cap, and a second debit fails", () => {
    const r = rig();
    r.run(parse({ kind: "applyStatus", sourceScope: "caster", statusId: ENERGY, duration: 2, stacks: 999 }), r.a);
    r.run(parse({ kind: "applyStatus", sourceScope: "caster", statusId: ENERGY, duration: 2, stacks: 999 }), r.b);
    expect(consumeStatusStacks(r.world, r.foe, ENERGY, "all")).toBe(1998);
    expect(consumeStatusStacks(r.world, r.foe, ENERGY, "all")).toBe(0);
  });

  it("baking never consumes a resource and branch choice reads the landing-time curse", () => {
    const r = rig(); r.run(curse);
    const baked = bakeCastTimeConditionals([reversal], r.context());
    expect(hasStatus(r.world, r.foe, CURSE, r.a)).toBe(true);
    clearPools(r.world, r.foe, { pools: { buffs: true } });
    const hp = r.world.health.get(r.foe)!.hp;
    runEffects(baked, r.context()); r.step();
    expect(r.world.health.get(r.foe)!.hp).toBeLessThan(hp);
    expect(hasStatus(r.world, r.foe, BOON)).toBe(false);
  });

  it.each([0, -1, 1.5, 1000, NaN, Infinity])("rejects malformed count %s without touching state", count => {
    const r = rig(); r.run(curse);
    expect(zEffectDef.safeParse({ ...reversal, count }).success).toBe(false);
    expect(consumeStatusStacks(r.world, r.foe, CURSE, count)).toBe(0);
    expect(hasStatus(r.world, r.foe, CURSE, r.a)).toBe(true);
  });
});
