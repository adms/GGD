import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { runEffects } from "../../../sim/effects/effectRunner";
import { clearRoundScoped, restoreForNextRound } from "../../../sim/clearPools";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { worldHookSystem } from "../../../sim/systems/WorldHookSystem";
import { resetMarksForRound } from "../../../sim/marks";
import { canSee } from "../../../sim/stealth";
import type { EffectDef } from "../../../sim/effects/effect";
import type { StatusId } from "../../../ids";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("35", rank);
  const dir = { type: "dir" as const, dir: { x: 1, z: 0 } }, self = { type: "self" as const };
  const status = (name: string, target = r.caster, caster = r.caster) => consumableStatusStacks(r.world, target, `${r.project.projectId}.${name}` as StatusId, caster);
  const effects = (list: EffectDef[], target = r.caster, caster = r.caster) => runEffects(list, { world: r.world, caster, targets: [target], rank, origin: "fixture", rng: r.world.rng });
  const setBreath = (count: number) => { r.world.marks.get(r.caster)!.get(`${r.project.projectId}.breath` as StatusId)!.count = count; };
  const hit = (source = r.enemy, target = r.caster, amount = 100, origin = "basic") => {
    r.world.damageQueue.push({ source, target, amount, type: "physical", crit: false, origin }); r.step();
  };
  const wall = (x: number) => r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map((z, i) => i ? z : {
    ...z, obstacles: [...z.obstacles, { kind: "segment" as const, a: { x: r.origin.x + x, z: r.origin.z - 5 }, b: { x: r.origin.x + x, z: r.origin.z + 5 } }],
  }) });
  const dodge = () => {
    // Equipment supplies the ordinary evasion stat; the hero never gets an
    // invented dodge from an empty movement command or a synthetic hook.
    attachSource(r.world, r.caster, { id: "fixture:evasion", kind: "item", modifiers: [{ stat: Stat.Evasion, op: ModOp.Override, value: .8 }] });
    recomputeStats(r.world, r.caster);
    for (let i = 0; i < 12 && status("opening", r.enemy) === 0; i++) {
      r.world.abilities.get(r.enemy)!.basicAttackCdTicks = 0; r.attack(); r.step(1); r.hold(); r.step(2);
    }
    expect(r.events.some(e => e.type === "evade" && e.data.target === r.caster)).toBe(true);
    expect(status("opening", r.enemy)).toBe(1);
  };
  return { ...r, dir, self, status, effects, setBreath, hit, wall, dodge };
}

describe("Tanjiro breathing, opening and one shared Q stance", () => {
  it.each([1, 4])("rank %i Q is one front arc, and fire costs more and hits harder", rank => {
    const r = setup(rank); r.place(r.enemy, 1.5, 1);
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, -1.5);
    expect(r.count("breath")).toBe(6); expect(r.cast("Q", r.dir, 15)).toBe("ok");
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]); expect(r.count("breath")).toBe(5);
    const water = r.hits("Q")[0]!.data.amount;
    expect(r.cast("EX", r.self, 8)).toBe("ok"); expect(r.status("fire")).toBe(1);
    r.ready("Q"); expect(r.cast("Q", r.dir, 15)).toBe("ok"); expect(r.count("breath")).toBe(3);
    expect(r.hits("Q")).toHaveLength(2); expect(r.hits("Q")[1]!.data.amount).toBeGreaterThan(water as number);
    expect(r.status("burden")).toBe(1);
  });

  it("EX preserves the actual Q instance, running cooldown, mana, breath and existing burden", () => {
    const r = setup(), q = r.world.abilities.get(r.caster)!.slots.Q;
    expect(r.cast("EX", r.self, 8)).toBe("ok"); expect(r.cast("Q", r.dir, 15)).toBe("ok");
    const cd = q.cooldownRemainingTicks, mana = r.world.health.get(r.caster)!.mana, breath = r.count("breath");
    r.world.abilities.get(r.caster)!.exSlot!.cooldownRemainingTicks = 0;
    expect(r.cast("EX", r.self)).toBe("ok"); expect(r.status("fire")).toBe(0);
    expect(r.world.abilities.get(r.caster)!.slots.Q).toBe(q); expect(q.cooldownRemainingTicks).toBe(cd);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(r.count("breath")).toBe(breath); expect(r.status("burden")).toBe(1);
    expect(r.cast("Q", r.dir)).toBe("cooldown");
  });

  it.each(["Q", "W", "R"] as const)("%s cannot spend insufficient breath, mana or cooldown", slot => {
    const r = setup(); if (slot === "Q") expect(r.cast("EX", r.self, 8)).toBe("ok");
    r.setBreath(slot === "Q" ? 1 : slot === "R" ? 2 : 0);
    const before = r.count("breath"), mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast(slot, r.dir)).toBe("no-resource"); expect(r.count("breath")).toBe(before);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(r.world.abilities.get(r.caster)!.slots[slot].cooldownRemainingTicks).toBe(0);
    r.step(30); expect(r.hits(slot)).toHaveLength(0);
  });

  it("a real defender dodge exposes that enemy until the next connected knife hit", () => {
    const r = setup(); r.dodge();
    attachSource(r.world, r.enemy, { id: "fixture:hidden", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } }); r.step();
    expect(canSee(r.world, r.caster, r.enemy)).toBe(true);
    r.hit(r.caster, r.enemy, 10, "basic"); expect(r.status("opening", r.enemy)).toBe(1);
    r.hit(r.caster, r.enemy, 10, "hook:derived"); expect(r.status("opening", r.enemy)).toBe(1);
    r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy);
    expect(r.cast("Q", r.dir, 15)).toBe("ok"); expect(r.status("opening", r.enemy)).toBe(0);
    expect(r.events.filter(e => e.type === "damage" && String(e.data.origin).startsWith("hook:") && e.data.origin !== "hook:derived")).toHaveLength(1);
    r.step(60); expect(r.status("opening", r.enemy)).toBe(0);
  });

  it("one caster cannot spend another caster's opening, and expiry removes visibility", () => {
    const r = setup(); r.dodge(); r.place(r.ally, 0, .5);
    expect(r.cast("Q", r.dir, 15, r.ally)).toBe("ok"); expect(r.status("opening", r.enemy)).toBe(1);
    attachSource(r.world, r.enemy, { id: "fixture:hidden", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } }); r.step();
    r.step(65); expect(r.status("opening", r.enemy)).toBe(0); expect(canSee(r.world, r.caster, r.enemy)).toBe(false);
  });

  it("waterwheel moves along a collision-safe path and touches each enemy once", () => {
    const r = setup(); r.place(r.enemy, 1.8); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 2.5);
    expect(r.cast("W", r.dir, 3)).toBe("ok"); expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x);
    r.step(25); expect(r.hits("W").map(e => e.data.target)).toEqual([r.enemy, r.distant]); expect(r.count("breath")).toBe(5);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeGreaterThan(2.5); r.step(20); expect(r.hits("W")).toHaveLength(2);
    const blocked = setup(); blocked.wall(1); blocked.place(blocked.enemy, 2.5); blocked.cast("W", blocked.dir, 30);
    expect(blocked.hits("W")).toHaveLength(0); expect(blocked.world.transform.get(blocked.caster)!.pos.x - blocked.origin.x).toBeLessThan(1);
  });

  it.each(["moving", "damaged", "shield-damaged"] as const)("%s lowers breath recovery below stationary breathing", mode => {
    const calm = setup(); calm.setBreath(0); expect(calm.cast("E", calm.self)).toBe("ok"); calm.step(35);
    const r = setup(); r.setBreath(0); expect(r.cast("E", r.self)).toBe("ok");
    const mana = r.world.health.get(r.caster)!.mana;
    const control = setup(); control.world.health.get(control.caster)!.mana = mana; control.step(35);
    if (mode === "shield-damaged") r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 4 }]);
    for (let i = 0; i < 35; i++) {
      if (mode === "moving") r.place(r.caster, i * .02);
      if (mode !== "moving" && i % 10 === 0) r.hit(); else r.step();
    }
    expect(r.count("breath")).toBeGreaterThan(0); expect(r.count("breath")).toBeLessThan(calm.count("breath"));
    expect(r.world.health.get(r.caster)!.mana).toBeCloseTo(control.world.health.get(control.caster)!.mana);
    r.step(100); expect(r.count("breath")).toBeLessThanOrEqual(6); expect(r.status("breathing")).toBe(0);
    r.setBreath(0); r.step(40); expect(r.count("breath")).toBe(0);
  });

  it("R charges before one strike, pays three breath and retains its payment when interrupted", () => {
    const r = setup(); expect(r.cast("R", r.dir, 10)).toBe("ok"); expect(r.hits("R")).toHaveLength(0); expect(r.count("breath")).toBe(3);
    r.step(25); expect(r.hits("R")).toHaveLength(1); expect(r.status("burden")).toBe(1);
    const stopped = setup(); stopped.cast("R", stopped.dir, 10);
    stopped.effects([{ kind: "applyStatus", statusId: "stun" as StatusId, stun: true, duration: 1 }]);
    stopped.step(30); expect(stopped.hits("R")).toHaveLength(0); expect(stopped.count("breath")).toBe(3);
    expect(stopped.status("burden")).toBe(0);
  });

  it("lethal damage ends breathing so a restored body cannot receive old payouts", () => {
    const r = setup(); r.setBreath(0); r.cast("E", r.self, 2); expect(r.status("breathing")).toBe(1);
    r.world.damageQueue.push({ source: r.enemy, target: r.caster, amount: 1000000, type: "true", crit: false, origin: "basic" });
    r.step(); expect(r.world.health.get(r.caster)!.alive).toBe(false); expect(r.status("breathing")).toBe(0);
    restoreForNextRound(r.world, r.caster); r.setBreath(0); r.step(60); expect(r.count("breath")).toBe(0);
  });

  it("burden caps and expires; a new round restores water and breath without old breathing payouts", () => {
    const r = setup(); r.cast("EX", r.self, 8);
    for (let i = 0; i < 4; i++) { r.setBreath(6); r.ready("Q"); r.cast("Q", r.dir, 15); }
    expect(r.status("burden")).toBe(3); r.step(65); expect(r.status("burden")).toBe(0);
    r.cast("E", r.self, 2); restoreForNextRound(r.world, r.caster); clearRoundScoped(r.world, r.caster); resetMarksForRound(r.world);
    r.world.events.length = 0; r.world.emit("roundStart", { round: ++r.world.round }); worldHookSystem(r.world);
    expect(r.count("breath")).toBe(6); expect(r.status("fire")).toBe(0); expect(r.status("breathing")).toBe(0);
    r.setBreath(0); r.step(100); expect(r.count("breath")).toBe(0);
  });
});
