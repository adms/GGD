import { beforeAll, describe, expect, it } from "vitest";
import { zEffectDef } from "../../content/schema/effect";
import { zEffectCondition } from "../../content/schema/condition";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { ModOp } from "../stats/modifiers";
import { recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { runEffects } from "./effectRunner";
import { hasStatus, statusStacks } from "./effectCommon";
import type { EffectDef } from "./effect";

beforeAll(() => registerSkeletonContent());
const CURSE = "fixture-owned-curse" as StatusId;
const REWARD = "fixture-owned-reward" as StatusId;
const parse = (value: unknown) => zEffectDef.parse(value) as EffectDef;

function rig() {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const centre = SKELETON_ARENA.zones[0]!.center;
  const ids = [0, 1, 2].map(seat => spawnChampion(world, {
    zone: 0, championId: SELA.id as ChampionId, seatId: asSeatId(seat),
    teamId: asTeamId(seat === 2 ? 1 : 0), pos: { x: centre.x + seat, z: centre.z },
  }));
  const [a, b, foe] = ids as [EntityId, EntityId, EntityId];
  const run = (caster: EntityId, effect: EffectDef) => runEffects([parse(effect)], {
    world, caster, rank: 1, targets: [foe], origin: "same-ability", rng: world.rng,
  });
  const gate = (caster: EntityId, minStacks?: number, owned = true) => {
    run(caster, {
      kind: "applyStatus", statusId: REWARD, duration: 1,
      condition: zEffectCondition.parse({ kind: "status", subject: "target", statusId: CURSE,
        ...(owned ? { appliedBy: "self" } : {}), ...(minStacks ? { minStacks } : {}) }),
    });
    const st = world.status.get(foe)!;
    const result = st.effects.some(s => s.statusId === REWARD);
    st.effects = st.effects.filter(s => s.statusId !== REWARD);
    return result;
  };
  return { world, a, b, foe, run, gate };
}

const marker = (stacks?: number): EffectDef => ({
  kind: "applyStatus", statusId: CURSE, sourceScope: "caster", duration: 4,
  ...(stacks === undefined ? {} : { stacks }),
});
const debuff = (stacked: boolean): EffectDef => ({
  kind: "applyBuff", statusId: CURSE, sourceScope: "caster", duration: 4,
  modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: -0.15 }],
  ...(stacked ? { stackKey: "fixture-curse", maxStacks: 1 } : { maxStacks: 1 }),
});

describe("caster-scoped status attribution", () => {
  it("same ability from two casters refreshes and adjusts only its own counter", () => {
    const r = rig();
    r.run(r.a, marker(2)); r.run(r.b, marker(1));
    expect(r.gate(r.a, 2)).toBe(true);
    expect(r.gate(r.b, 2)).toBe(false);
    r.run(r.a, marker(-2));
    expect(r.gate(r.a)).toBe(false);
    expect(r.gate(r.b)).toBe(true);
    expect(statusStacks(r.world, r.foe, CURSE)).toBe(1);
  });

  it("a refresh does not extend the other caster's expiry", () => {
    const r = rig();
    r.run(r.a, marker()); r.run(r.b, marker());
    const expires = r.world.status.get(r.foe)!.effects.find(s => s.applierId === r.b)!.expiresAtTick;
    r.world.tick = expires - 1;
    r.run(r.a, marker());
    r.world.tick = expires;
    expect(r.gate(r.a)).toBe(true);
    expect(r.gate(r.b)).toBe(false);
  });

  it.each([true, false])("buff attribution and maxStacks are per caster (stacked=%s)", stacked => {
    const r = rig();
    recomputeStats(r.world, r.foe);
    const before = r.world.stats.get(r.foe)!.final.ad;
    r.run(r.a, debuff(stacked));
    expect(r.gate(r.a)).toBe(true); expect(r.gate(r.b)).toBe(false);
    recomputeStats(r.world, r.foe);
    const oneCurse = r.world.stats.get(r.foe)!.final.ad;
    expect(oneCurse).toBeLessThan(before);
    r.run(r.b, debuff(stacked)); r.run(r.a, debuff(stacked));
    expect(statusStacks(r.world, r.foe, CURSE, r.a)).toBe(1);
    expect(statusStacks(r.world, r.foe, CURSE, r.b)).toBe(1);
    recomputeStats(r.world, r.foe);
    // GGD's additive base bonus is outside percent modifiers. Compare the
    // actual one-source delta, rather than incorrectly scaling that bonus.
    expect(r.world.stats.get(r.foe)!.final.ad).toBeCloseTo(before - 2 * (before - oneCurse), 4);
    const expires = r.world.stats.get(r.foe)!.sources.find(s => s.applierId === r.a)!.expiresAtTick!;
    r.world.tick = expires;
    expect(r.gate(r.a)).toBe(false);
    r.run(r.a, debuff(stacked));
    expect(r.gate(r.a)).toBe(true);
    expect(statusStacks(r.world, r.foe, CURSE, r.a)).toBe(1);
  });

  it("unattributed legacy statuses still share one source but never impersonate a caster", () => {
    const r = rig();
    const { sourceScope: _drop, ...legacy } = marker(1) as Extract<EffectDef, { kind: "applyStatus" }>;
    r.run(r.a, legacy); r.run(r.b, legacy);
    expect(statusStacks(r.world, r.foe, CURSE)).toBe(2);
    expect(r.world.status.get(r.foe)!.effects.filter(s => s.statusId === CURSE)).toHaveLength(1);
    expect(r.gate(r.a)).toBe(false);
    expect(r.gate(r.b, 2, false)).toBe(true);
    r.run(r.a, marker());
    expect(r.gate(r.a)).toBe(true);
    expect(statusStacks(r.world, r.foe, CURSE, r.a)).toBe(1);
  });

  it("self-cast and missing attribution use the same live-status reader", () => {
    const r = rig();
    runEffects([parse(marker())], { world: r.world, caster: r.a, targets: [r.a], rank: 1,
      origin: "same-ability", rng: r.world.rng });
    expect(hasStatus(r.world, r.a, CURSE, r.a)).toBe(true);
    expect(hasStatus(r.world, r.a, CURSE, r.b)).toBe(false);
  });

  it("a legacy author key cannot collide with a caster-scoped stack identity", () => {
    const r = rig();
    const { sourceScope: _drop, ...legacy } = debuff(true) as Extract<EffectDef, { kind: "applyBuff" }>;
    r.run(r.b, { ...legacy, stackKey: `fixture-curse:caster:${r.a}` });
    r.run(r.a, debuff(true));
    expect(r.gate(r.a)).toBe(true);
    expect(statusStacks(r.world, r.foe, CURSE)).toBe(2);
    expect(statusStacks(r.world, r.foe, CURSE, r.a)).toBe(1);
  });

  it("unknown scopes and tag-only ownership are rejected", () => {
    expect(zEffectDef.safeParse({ ...marker(), sourceScope: "guess-name" }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...debuff(true), sourceScope: "target" }).success).toBe(false);
    expect(zEffectCondition.safeParse({ kind: "status", subject: "target", tag: "curse", appliedBy: "self" }).success).toBe(false);
  });

  it.each(["marker", "buff"] as const)("digest observes ownership changes before damage (%s)", kind => {
    const r = rig();
    r.run(r.a, kind === "marker" ? marker() : debuff(true));
    const record = kind === "marker"
      ? r.world.status.get(r.foe)!.effects.find(s => s.applierId === r.a)!
      : r.world.stats.get(r.foe)!.sources.find(s => s.applierId === r.a)!;
    const before = r.world.digest();
    record.applierId = r.b;
    expect(r.world.digest()).not.toBe(before);
    record.applierId = r.a;
    expect(r.world.digest()).toBe(before);
  });
});

it.each(["replace", "reject"] as const)("caster-scoped exclusive %s only considers that caster's own group", mode => {
  const r = rig();
  const old = { ...debuff(true), exclusiveGroup: "fixture-group", exclusiveOnExisting: mode } as EffectDef;
  r.run(r.a, old); r.run(r.b, old);
  expect(r.gate(r.a)).toBe(true); expect(r.gate(r.b)).toBe(true);
  r.run(r.a, { ...old, statusId: REWARD, stackKey: "fixture-next" } as EffectDef);
  expect(r.gate(r.a)).toBe(mode === "reject"); expect(r.gate(r.b)).toBe(true);
});
