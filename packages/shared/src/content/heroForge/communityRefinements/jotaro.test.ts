import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { runEffects } from "../../../sim/effects/effectRunner";
import { restoreForNextRound } from "../../../sim/clearPools";
import { isTimeStopped } from "../../../sim/timeStop";
import type { EffectDef } from "../../../sim/effects/effect";
import type { StatusId } from "../../../ids";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("04", rank);
  const target = { type: "entity" as const, entityId: r.enemy }, self = { type: "self" as const };
  const precision = (id = r.caster) => consumableStatusStacks(r.world, id, `${r.project.projectId}.precision` as StatusId, id);
  const guard = () => consumableStatusStacks(r.world, r.caster, `${r.project.projectId}.guard` as StatusId, r.caster);
  const effect = (effects: EffectDef[], target = r.caster, caster = r.caster) => runEffects(effects, {
    world: r.world, caster, targets: [target], rank, origin: "fixture", rng: r.world.rng,
  });
  const hit = (source = r.caster, victim = r.enemy, type: "physical" | "magic" | "true" = "physical", origin = "basic", amount = 100) => {
    const hp = r.world.health.get(victim)!.hp;
    r.world.damageQueue.push({ source, target: victim, type, origin, amount, crit: false }); r.step();
    return hp - r.world.health.get(victim)!.hp;
  };
  const stop = () => { expect(r.cast("R", self, 13)).toBe("ok"); expect(r.world.timeStop.size).toBe(1); };
  return { ...r, target, self, precision, guard, effect, hit, stop };
}

describe("Jotaro source-authored precision, guard and local time stop", () => {
  it.each([1, 4])("rank %i precision caps at three and only the next Q gets a stronger finisher", rank => {
    const r = setup(rank);
    r.hit(); r.hit(); expect(r.precision()).toBe(2);
    expect(r.cast("Q", r.target, 28)).toBe("ok"); expect(r.hits("Q")).toHaveLength(4); expect(r.precision()).toBe(3);
    r.ready("Q"); expect(r.cast("Q", r.target, 28)).toBe("ok");
    expect(r.hits("Q")).toHaveLength(9); expect(r.precision()).toBe(1);
    const last = r.hits("Q").slice(4); expect(new Set(last.map(h => h.tick)).size).toBe(4);
    r.step(245); expect(r.precision()).toBe(0);
  });

  it("successful shield hits count, while far, immune, derived and allied hits do not", () => {
    const r = setup(); r.effect([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy);
    expect(r.hit()).toBe(0); expect(r.precision()).toBe(1);
    r.place(r.enemy, 6); r.hit(); expect(r.precision()).toBe(1);
    r.place(r.enemy, 1.8); r.hit(r.caster, r.enemy, "physical", "hook:derived"); expect(r.precision()).toBe(1);
    r.hit(r.caster, r.ally); expect(r.precision()).toBe(1);
    r.effect([{ kind: "invulnerable", durationSec: 1, applyTo: "target" }], r.enemy); r.hit(); expect(r.precision()).toBe(1);
    restoreForNextRound(r.world, r.caster); expect(r.precision()).toBe(0);
  });

  it.each(["far", "behind", "dead", "zone", "caster-dead", "settled"] as const)("Q %s stops later strikes without retargeting", mode => {
    const r = setup(); expect(r.cast("Q", r.target, 7)).toBe("ok"); expect(r.hits("Q")).toHaveLength(1);
    if (mode === "far") r.place(r.enemy, 6);
    if (mode === "behind") r.place(r.enemy, -2);
    if (mode === "dead") r.world.health.get(r.enemy)!.alive = false;
    if (mode === "zone") r.world.transform.get(r.enemy)!.zone++;
    if (mode === "caster-dead") r.world.health.get(r.caster)!.alive = false;
    if (mode === "settled") r.world.settledZones.add(0);
    r.step(12); if (mode === "far" || mode === "behind") r.place(r.enemy, 1.8); r.step(15);
    expect(r.hits("Q")).toHaveLength(1);
  });

  it("W resolves one line and hits only the nearest legal enemy once", () => {
    const r = setup(); r.place(r.enemy, 3); r.place(r.distant, 5);
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    expect(r.cast("W", { type: "dir", dir: { x: 1, z: 0 } }, 20)).toBe("ok");
    expect(r.hits("W").map(h => h.data.target)).toEqual([r.enemy]);
    expect(r.precision()).toBe(1); r.ready("W"); r.place(r.enemy, 3, 3); r.place(r.distant, 5, 3);
    r.cast("W", { type: "dir", dir: { x: 1, z: 0 } }, 15); expect(r.hits("W")).toHaveLength(1);
  });

  it.each(["independent", "best"] as const)("E uses live frontal geometry and consumes one successful source (%s)", stacking => {
    const r = setup(); r.world.blockRules = { ...r.world.blockRules, stacking };
    const pos = { ...r.world.transform.get(r.caster)!.pos }; expect(r.cast("E", r.self)).toBe("ok");
    expect(r.world.health.get(r.caster)!.shields).toHaveLength(0); expect(r.guard()).toBe(1);
    r.place(r.enemy, -1.8); const back = r.hit(r.enemy, r.caster); expect(back).toBeGreaterThan(0); expect(r.guard()).toBe(1);
    r.place(r.enemy, 1.8); const front = r.hit(r.enemy, r.caster); expect(front).toBeCloseTo(back * .2, 4); expect(r.guard()).toBe(0);
    r.step(5); expect(r.world.transform.get(r.enemy)!.pos.x).toBeGreaterThan(r.origin.x + 1.8);
    expect(r.world.transform.get(r.caster)!.pos).toEqual(pos);
    expect(r.hit(r.enemy, r.caster)).toBeGreaterThan(front);
  });

  it("true damage and expiry cannot consume or renew a frontal guard", () => {
    const r = setup(); r.cast("E", r.self); r.hit(r.enemy, r.caster, "true"); expect(r.guard()).toBe(1);
    r.step(20); expect(r.guard()).toBe(0); expect(r.hit(r.enemy, r.caster)).toBeGreaterThan(0);
  });

  it.each([1, 4])("rank %i R freezes the enemy while actual Q and EX hits wait in the same queue", rank => {
    const r = setup(rank); r.stop(); const hp = r.world.health.get(r.enemy)!.hp;
    expect(isTimeStopped(r.world, r.enemy)).toBe(true); expect(isTimeStopped(r.world, r.caster)).toBe(false);
    expect(r.cast("Q", r.target, 25)).toBe("ok");
    expect(r.hits("Q")).toHaveLength(0); expect(r.precision()).toBe(0); expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
    expect([...r.world.timeStop.values()][0]!.hits).toHaveLength(4);
    r.step(15); expect(r.hits("Q")).toHaveLength(4); expect(r.precision()).toBe(1);
    r.ready("R"); r.stop(); const before = r.world.health.get(r.enemy)!.hp;
    expect(r.cast("EX", r.target, 14)).toBe("ok"); expect(r.hits("EX")).toHaveLength(0);
    expect(r.world.health.get(r.enemy)!.hp).toBe(before); expect([...r.world.timeStop.values()][0]!.hits).toHaveLength(1);
    r.step(30); expect(r.hits("EX")).toHaveLength(1); expect(r.world.health.get(r.enemy)!.hp).toBeLessThan(before);
  });

  it("EX has startup, independent costs and cannot hit a target that left its facing arc", () => {
    const r = setup(), mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", r.target)).toBe("ok"); expect(r.hits("EX")).toHaveLength(0);
    expect(r.world.health.get(r.caster)!.mana).toBeLessThan(mana); expect(r.world.abilities.get(r.caster)!.exSlot!.cooldownRemainingTicks).toBeGreaterThan(0);
    r.place(r.enemy, -2); r.step(20); expect(r.hits("EX")).toHaveLength(0);
    r.step(30); // The first whiff still owes its normal recovery.
    r.place(r.enemy, 1.8); r.ready("EX"); expect(r.cast("EX", r.target, 20)).toBe("ok"); expect(r.hits("EX")).toHaveLength(1);
  });
});
