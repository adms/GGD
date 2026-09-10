import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Abilities } from "../../../sim/content/registry";
import { recastView } from "../../../sim/abilities/recast";
import { installMark } from "../../../sim/marks";
import { runEffects } from "../../../sim/effects/effectRunner";
import { zAbilityDoc } from "../../schema/ability";
import type { AbilityDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function setup(rank = 1, overrides: Partial<AbilityDef> = {}) {
  const r = communityActionFixture("02", rank);
  const inst = r.world.abilities.get(r.caster)!.slots.E;
  const def = { ...Abilities.get(inst.abilityId), ...overrides };
  Abilities.register(inst.abilityId, def);
  const view = () => recastView(r.world, r.caster, inst, def);
  const dir = { type: "dir" as const, dir: { x: 1, z: 0 } };
  return { ...r, inst, def, dir, view };
}
describe("Iori E: source-authored independent recast inputs", () => {
  it.each([1, 4])("one input only executes one stage at rank %s", rank => {
    const r = setup(rank); expect(r.cast("E", r.dir, 12)).toBe("ok");
    expect(r.hits("E")).toHaveLength(1); expect(r.view().stage).toBe(2);
    r.step(35); expect(r.hits("E")).toHaveLength(1); expect(r.view().stage).toBe(0);
  });
  it("three distinct inputs pay once, third ends and a fourth is rejected by the real cooldown", () => {
    const r = setup(); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("E", r.dir, 7)).toBe("ok"); const cd = r.inst.cooldownRemainingTicks;
    const paid = r.world.health.get(r.caster)!.mana; expect(paid).toBeLessThan(mana);
    r.world.health.get(r.caster)!.mana = 0;
    expect(r.cast("E", r.dir)).toBe("ok"); expect(r.world.health.get(r.caster)!.mana).toBe(0); r.step(7); expect(r.view().stage).toBe(3);
    const thirdMana = r.world.health.get(r.caster)!.mana; expect(r.cast("E", r.dir)).toBe("ok");
    expect(r.world.health.get(r.caster)!.mana).toBe(thirdMana); r.step(); expect(r.view().stage).toBe(0);
    expect(r.hits("E")).toHaveLength(3); expect(r.hits("E")[2]!.data.amount).toBeGreaterThan(r.hits("E")[0]!.data.amount as number);
    expect(r.world.health.get(r.caster)!.mana).toBeGreaterThanOrEqual(0); expect(r.inst.cooldownRemainingTicks).toBe(cd - 8);
    expect(r.cast("E", r.dir)).toBe("cooldown");
  });
  it("rapid presses cannot skip stages, move deadlines or produce extra hits", () => {
    const r = setup(); r.cast("E", r.dir); const saved = structuredClone(r.inst.recast);
    for (let i = 0; i < 15; i++) expect(r.cast("E", r.dir)).toBe("cooldown");
    expect(r.inst.recast).toEqual(saved); r.step(5); expect(r.cast("E", r.dir)).toBe("cooldown");
    r.step(); expect(r.cast("E", r.dir, 1)).toBe("ok"); expect(r.hits("E")).toHaveLength(2);
  });
  it("the deadline is exclusive and rejecting a bad direction does not refresh it", () => {
    const r = setup(); r.cast("E", r.dir, 35); const saved = structuredClone(r.inst.recast);
    expect(r.cast("E", { type: "dir", dir: { x: 0, z: 0 } })).toBe("bad-target"); expect(r.inst.recast).toEqual(saved);
    r.step(); expect(r.view().stage).toBe(0); expect(r.cast("E", r.dir)).toBe("cooldown");
    expect(r.hits("E")).toHaveLength(1);
  });
  it("the last legal input before the deadline opens a fresh bounded window", () => {
    const r = setup(); r.cast("E", r.dir, 35); expect(r.cast("E", r.dir, 1)).toBe("ok");
    expect(r.view().stage).toBe(3); expect(r.view().windowTicks).toBe(35); expect(r.hits("E")).toHaveLength(2);
  });
  it.each(["stun", "silenced", "root", "feared", "dead", "knockdown", "settled"] as const)("%s cancels the continuation without refund", mode => {
    const r = setup(); r.cast("E", r.dir, 7); const cd = r.inst.cooldownRemainingTicks;
    if (mode === "dead") r.world.health.get(r.caster)!.alive = false;
    else if (mode === "knockdown") r.world.knockdown.set(r.caster, 10);
    else if (mode === "settled") r.world.settledZones.add(r.world.transform.get(r.caster)!.zone);
    else runEffects([{ kind: "applyStatus", statusId: `test-${mode}`, duration: 1, [mode]: true }] as never, {
      world: r.world, caster: r.enemy, targets: [r.caster], rank: 1, origin: "test:control", rng: r.world.rng });
    r.step(); expect(r.view().stage).toBe(0); expect(r.hits("E")).toHaveLength(1);
    expect(r.inst.cooldownRemainingTicks).toBeLessThanOrEqual(cd); expect(r.inst.cooldownRemainingTicks).toBeGreaterThan(0);
    r.step(50); expect(r.hits("E")).toHaveLength(1);
  });
  it("each press can change direction; missing still spends the stage without retargeting", () => {
    const r = setup(); r.cast("E", r.dir, 7); expect(r.cast("E", { type: "dir", dir: { x: -1, z: 0 } }, 7)).toBe("ok");
    expect(r.hits("E")).toHaveLength(1); expect(r.view().stage).toBe(3);
    expect(r.cast("E", r.dir)).toBe("recovery"); r.step(12);
    expect(r.cast("E", r.dir, 1)).toBe("ok"); expect(r.hits("E")).toHaveLength(2); expect(r.view().stage).toBe(0);
  });
  it("each-cost mode rejects empty mana without consuming a stage or refreshing its timer", () => {
    const r = setup(); const def = { ...r.def, recast: { ...r.def.recast!, cost: "each" as const } };
    Abilities.register(r.inst.abilityId, def); r.cast("E", r.dir, 7); r.world.health.get(r.caster)!.mana = 0;
    const saved = structuredClone(r.inst.recast); expect(r.cast("E", r.dir)).toBe("no-mana"); expect(r.inst.recast).toEqual(saved);
  });
  it.each(["commit", "resolve"] as const)("windup stages resolve the selected program once in %s mode", mode => {
    const r = setup();
    r.inst.rank = 1;
    const def = { ...r.def, castTimeSec: .1 }; Abilities.register(r.inst.abilityId, def);
    r.world.castTimeRules = { ...r.world.castTimeRules, comboWindowFrom: mode };
    r.cast("E", r.dir, 12); expect(r.hits("E")).toHaveLength(1);
    r.cast("E", r.dir, 12); r.cast("E", r.dir, 12);
    expect(r.hits("E")).toHaveLength(3); expect(r.hits("E")[2]!.data.amount).toBeGreaterThan(r.hits("E")[0]!.data.amount as number);
    expect(r.view().stage).toBe(0);
  });
  it("interrupted windup does not unlock the next stage", () => {
    const r = setup(1, { castTimeSec: .4 }); r.cast("E", r.dir, 1);
    r.world.knockdown.set(r.caster, 5); r.step(20);
    expect(r.hits("E")).toHaveLength(0); expect(r.view().stage).toBe(0);
  });
  it("snapshot reads are pure and state participates in the deterministic digest", () => {
    const r = setup(); r.cast("E", r.dir, 7); const before = r.world.digest();
    const state = JSON.stringify(r.inst); r.view(); expect(JSON.stringify(r.inst)).toBe(state);
    r.inst.recast!.readyAt++; expect(r.world.digest()).not.toBe(before);
    r.world.tick = r.inst.recast!.expiresAt; const stale = JSON.stringify(r.inst); expect(r.view().stage).toBe(0); expect(JSON.stringify(r.inst)).toBe(stale);
  });
  it("rank changes invalidate a window and another hero has an independent stage clock", () => {
    const r = setup(); r.cast("E", r.dir, 7); const other = r.world.abilities.get(r.ally)!.slots.E;
    expect(other.recast).toBeUndefined(); expect(other.cooldownRemainingTicks).toBe(0);
    expect(r.cast("E", r.dir, 0, r.ally)).toBe("ok");
    expect(other.recast?.nextStage).toBe(1); r.inst.rank = 2;
    expect(r.view().stage).toBe(0); expect(r.cast("E", r.dir)).toBe("cooldown");
    expect(other.recast?.nextStage).toBe(1);
  });
  it("first-paid status resources are consumed once and cannot be borrowed by a new sequence", () => {
    const r = setup();
    const statusId = "test-recast-cost" as import("../../../ids").StatusId;
    const def = { ...r.def, statusCost: { statusId, count: 1 } };
    Abilities.register(r.inst.abilityId, def);
    installMark(r.world, r.caster, { markId: statusId, initial: 1, max: 1, durationSec: -1, resetOn: "never" });
    expect(r.cast("E", r.dir, 7)).toBe("ok"); expect(r.cast("E", r.dir, 7)).toBe("ok");
    expect(r.cast("E", r.dir, 1)).toBe("ok"); expect(r.hits("E")).toHaveLength(3);
    r.ready("E"); expect(r.cast("E", r.dir)).toBe("no-resource");
  });
  it("schema rejects invalid timers and out-of-contract stage effects", () => {
    const r = setup(); const doc = r.compiled.abilityDrafts.E;
    for (const recast of [{ ...doc.recast!, windowSec: .1, minIntervalSec: .2 }, { ...doc.recast!, stages: [] }, { ...doc.recast!, stages: [{ effects: [{ kind: "unknown" }] }] }]) {
      expect(zAbilityDoc.safeParse({ ...doc, recast }).success).toBe(false);
    }
  });
});
