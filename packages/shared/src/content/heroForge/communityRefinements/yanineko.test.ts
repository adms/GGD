import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runEffects } from "../../../sim/effects/effectRunner";
import { markCount, resetMarksForRound } from "../../../sim/marks";
import { missChanceOf } from "../../../sim/combat/evasion";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { invalidateHookLedgers } from "../../../sim/effects/hookIcd";
import { zEffectDef, zHookDef } from "../../schema/effect";
import { orderSystem } from "../../../sim/systems/OrderSystem";
import { asSeatId, type StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("30", rank);
  const point = (x: number, z = 0) => ({ type: "point" as const, point: { x: r.origin.x + x, z: r.origin.z + z } });
  const effects = (effects: EffectDef[], target = r.caster, caster = r.caster) => runEffects(effects, { world: r.world, caster,
    targets: [target], rank, origin: "test:fixture", rng: r.world.rng });
  const hit = (amount = 100, target = r.caster) => {
    r.world.damageQueue.push({ source: r.enemy, target, amount, type: "physical", crit: false, origin: "basic" }); r.step();
  };
  const shield = (id = r.caster) => r.world.health.get(id)!.shields.filter(s => s.expiresAtTick > r.world.tick && s.amount > 0);
  const walk = (x: number) => orderSystem(r.world, new Map([[asSeatId(0), { order: { kind: "move", point: point(x).point }, commands: [] }]]));
  const holdCaster = () => orderSystem(r.world, new Map([[asSeatId(0), { order: { kind: "hold" }, commands: [] }]]));
  const wall = (x: number) => r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map((z, i) => i ? z : {
    ...z, obstacles: [...z.obstacles, { kind: "segment" as const, a: { x: r.origin.x + x, z: r.origin.z - 5 }, b: { x: r.origin.x + x, z: r.origin.z + 5 } }],
  }) });
  return { ...r, point, effects, hit, shield, walk, holdCaster, wall, count: () => r.count("procrastination") };
}
describe("Yanineko original six-slot requirements", () => {
  it("waits for actual stillness, gains at most one per second and caps at three", () => {
    const r = setup(); expect(r.count()).toBe(0); r.step(29); expect(r.count()).toBe(0);
    r.step(2); expect(r.count()).toBe(1); r.step(30); expect(r.count()).toBe(2);
    r.step(150); expect(r.count()).toBe(3);
  });
  it("walking during the interval cooldown restarts the entire stillness window", () => {
    const r = setup(); r.place(r.ally, -8, 6); r.step(31); expect(r.count()).toBe(1);
    r.walk(-6); r.step(25); expect(r.world.transform.get(r.caster)!.pos.x).toBeLessThan(r.origin.x - 1); expect(r.count()).toBe(1);
    r.holdCaster(); r.step(20); expect(r.count()).toBe(1);
    r.step(15); expect(r.count()).toBe(2);
  });
  it("a real grounded retreat does not earn stillness while moving", () => {
    const r = setup(); r.step(20); r.cast("E", { type: "dir", dir: { x: -1, z: 0 } }, 10);
    expect(r.count()).toBe(0); r.step(20); expect(r.count()).toBe(0); r.step(15); expect(r.count()).toBe(1);
  });
  it("turning in place and a fully blocked move order still allow accumulation", () => {
    const r = setup(); const radius = r.world.transform.get(r.caster)!.radius; r.wall(radius); r.walk(6);
    r.step(35); expect(r.world.transform.get(r.caster)!.pos.x).toBeCloseTo(r.origin.x, 4);
    expect(r.count()).toBe(1); r.world.transform.get(r.caster)!.facing = { x: 0, z: 1 };
    r.step(30); expect(r.count()).toBe(2);
  });
  it.each(["plain", "shield"])("a real %s-absorbed hit clears all accumulated stacks", mode => {
    const r = setup(); r.step(100); if (mode === "shield") r.effects([{ kind: "shield", amount: { flat: 1000 }, duration: 3 }]);
    r.hit(); expect(r.count()).toBe(0);
  });
  it.each(["zero", "immune"])("%s damage cannot erase stored stacks", mode => {
    const r = setup(); r.step(100); if (mode === "immune") r.effects([{ kind: "invulnerable", durationSec: 1 }]);
    r.hit(mode === "zero" ? 0 : 100); expect(r.count()).toBe(3);
  });
  it("no accumulation occurs in intermission, death or a settled zone; return restarts the wait", () => {
    for (const state of ["intermission", "death", "settled"] as const) {
      const r = setup(); r.step(20);
      if (state === "intermission") r.world.combatActive = false;
      if (state === "death") r.world.health.get(r.caster)!.alive = false;
      if (state === "settled") r.world.settledZones.add(r.world.transform.get(r.caster)!.zone);
      r.step(40); expect(r.count()).toBe(0); r.world.combatActive = true; r.world.health.get(r.caster)!.alive = true; r.world.settledZones.clear();
      r.step(20); expect(r.count()).toBe(0); r.step(15); expect(r.count()).toBe(1);
    }
  });
  it("a new round clears resources and does not inherit the previous stillness timer", () => {
    const r = setup(); r.step(100); r.world.round++; resetMarksForRound(r.world);
    expect(r.count()).toBe(0); r.step(20); expect(r.count()).toBe(0); r.step(15); expect(r.count()).toBe(1);
  });
  it.each([1, 4])("Q damages once at landing rather than cast acceptance, rank %s", rank => {
    const r = setup(rank); r.place(r.enemy, 3); r.place(r.ally, 3, 1);
    r.cast("Q", r.point(3), 15); expect(r.hits("Q")).toHaveLength(0);
    r.step(15); expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]);
    r.step(40); expect(r.hits("Q")).toHaveLength(1);
  });
  it("Q re-resolves the landing area so an escaping victim is missed and a later arrival is hit", () => {
    const r = setup(); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    r.cast("Q", r.point(3), 8); r.place(r.enemy, 10); r.place(r.distant, 3); r.step(20);
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.distant]);
  });
  it("smoke affects enemies entering its fixed area, expires after leaving, and never grants invisibility", () => {
    const r = setup(); r.place(r.enemy, 3); r.place(r.ally, 3, 1); const hp = r.world.health.get(r.enemy)!.hp;
    r.cast("W", r.point(3), 15); expect(missChanceOf(r.world, r.enemy)).toBeCloseTo(.3);
    expect(missChanceOf(r.world, r.ally)).toBe(0); expect(r.world.health.get(r.enemy)!.hp).toBe(hp); expect(r.hits("W")).toHaveLength(0);
    expect(r.world.stats.get(r.enemy)!.sources.some(s => s.vision)).toBe(false);
    r.place(r.enemy, 10); r.step(9); expect(missChanceOf(r.world, r.enemy)).toBe(0);
    r.place(r.enemy, 3); r.place(r.caster, -8); r.step(9); expect(missChanceOf(r.world, r.enemy)).toBeCloseTo(.3);
    r.step(110); expect(missChanceOf(r.world, r.enemy)).toBe(0);
  });
  it("smoke respects control immunity and shows its entry message only once until re-entry", () => {
    const r = setup(); r.place(r.enemy, 3); r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 3, blocksControl: true }], r.enemy);
    r.cast("W", r.point(3), 25); expect(missChanceOf(r.world, r.enemy)).toBe(0);
    const text = r.events.filter(e => e.type === "floatingText" && String(e.data.text).includes("煙霧"));
    expect(text).toHaveLength(1);
  });
  it("E is a harmless finite retreat that stops at terrain", () => {
    const r = setup(); r.place(r.enemy, 2, 1); r.wall(2);
    r.cast("E", { type: "dir", dir: { x: 1, z: 0 } }, 25);
    expect(r.hits("E")).toHaveLength(0); expect(r.world.nav.get(r.enemy)!.override).toBeNull();
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(2);
    expect(r.events.some(e => e.type === "leap")).toBe(false);
  });
  it("R schedules three separate warned landing waves and rechecks each wave's victims", () => {
    const r = setup(); r.place(r.enemy, 3); r.place(r.ally, 3, 1);
    r.cast("R", r.point(3), 80);
    const hits = r.hits("R"); expect(hits).toHaveLength(3); expect(hits.every(e => e.data.target === r.enemy)).toBe(true);
    const warnings = r.events.filter(e => e.type === "vfxSpawn" && e.data.origin === `ability:${r.project.projectId}.r` && e.data.vfxId === "fx.prim.sound.pulse-sm");
    expect(warnings).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(hits[i]!.tick - warnings[i]!.tick).toBeGreaterThanOrEqual(12);
    expect(new Set(hits.map(e => e.tick)).size).toBe(3);
  });
  it("R has no lingering payout after caster death or a settled duel", () => {
    for (const end of ["death", "settled"] as const) {
      const r = setup(); r.place(r.enemy, 3); r.cast("R", r.point(3), 28); const n = r.hits("R").length; expect(n).toBe(1);
      if (end === "death") r.world.health.get(r.caster)!.alive = false;
      else r.world.settledZones.add(r.world.transform.get(r.caster)!.zone);
      r.step(70); expect(r.hits("R")).toHaveLength(n);
    }
  });
  it("EX refuses an empty resource without paying and consumes exactly one earned stack", () => {
    const r = setup(); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "self" })).toBe("no-resource"); expect(r.shield()).toHaveLength(0);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
    r.step(100); expect(r.count()).toBe(3); expect(r.cast("EX", { type: "self" })).toBe("ok");
    expect(r.count()).toBe(2); expect(r.shield()).toHaveLength(1);
  });
  it("moving expires only EX's own pool before same-tick damage, preserving a foreign shield", () => {
    const r = setup(); r.step(40); r.effects([{ kind: "shield", amount: { flat: 100 }, duration: 8 }]);
    r.cast("EX", { type: "self" }); expect(r.shield()).toHaveLength(2);
    r.walk(-6); r.hit(50); expect(r.world.transform.get(r.caster)!.pos.x).toBeLessThan(r.origin.x); expect(r.shield()).toHaveLength(1); expect(r.shield()[0]!.moveBreakAnchor).toBeUndefined();
    expect(r.shield()[0]!.amount).toBeLessThan(100);
  });
  it("turning and a blocked order retain EX until its finite deadline", () => {
    const r = setup(); r.step(40); r.cast("EX", { type: "self" });
    r.world.transform.get(r.caster)!.facing = { x: 0, z: 1 };
    r.wall(r.world.transform.get(r.caster)!.radius); r.walk(8); r.step(25); expect(r.shield()).toHaveLength(1);
    r.step(100); expect(r.shield()).toHaveLength(0);
  });
  it.each(["blink", "death", "zone"])("%s ends the stationary shield without breaking unrelated pools", mode => {
    const r = setup(); r.step(40); r.cast("EX", { type: "self" }); r.effects([{ kind: "shield", amount: { flat: 100 }, duration: 8 }]);
    if (mode === "blink") r.place(r.caster, 3);
    if (mode === "death") r.world.health.get(r.caster)!.alive = false;
    if (mode === "zone") r.world.transform.get(r.caster)!.zone++;
    r.step(); expect(r.shield()).toHaveLength(1); expect(r.shield()[0]!.sourceId).toBe("test:fixture");
  });
  it("ledger invalidation and replay digest include the real stationary wait", () => {
    const r = setup(); r.step(10); const source = r.world.stats.get(r.caster)!.sources.find(s => s.hookStillness)!;
    expect(source).toBeDefined(); const digest = r.world.digest(); source.hookStillness![0]!.since -= 5;
    expect(r.world.digest()).not.toBe(digest); invalidateHookLedgers(source); expect(source.hookStillness).toBeUndefined();
    r.step(20); expect(r.count()).toBe(0); r.step(15); expect(r.count()).toBe(1);
  });
  it("one hero moving cannot restart another hero's stationary clock", () => {
    const r = setup(); r.place(r.ally, -8, 6); r.step(20); r.walk(-6); r.step(15);
    expect(r.count()).toBe(0); expect(r.world.stats.get(r.ally)!.sources.some(s => s.hookStillness)).toBe(true);
    expect(markCount(r.world, r.ally, `${r.project.projectId}.procrastination` as StatusId)).toBe(1);
  });
  it("R rechecks arrivals and departures independently at every landing", () => {
    const r = setup(); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    r.cast("R", r.point(3), 28); expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy]);
    r.place(r.enemy, 10); r.place(r.distant, 3); r.step(55);
    expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy, r.distant, r.distant]);
  });
  it("vertical displacement resets stillness and cancels the shield without horizontal travel", () => {
    const r = setup(); r.step(40); r.cast("EX", { type: "self" });
    r.effects([{ kind: "leap", mode: "inPlace", apexHeight: 2, durationSec: 1 }]); r.step(15);
    expect(r.world.airborne.get(r.caster)!.y).toBeGreaterThan(1); expect(r.shield()).toHaveLength(0); expect(r.count()).toBe(0);
    r.step(30); expect(r.count()).toBe(0); r.step(20); expect(r.count()).toBe(1);
  });
  it("replacement renews the shield anchor and a normal replacement removes it", () => {
    const r = setup(); const effect = { kind: "shield" as const, amount: { flat: 100 }, duration: 5, stackKey: "test:replace", onExisting: "replace" as const };
    r.effects([{ ...effect, breakOnMove: true }]); r.place(r.caster, -3); r.effects([{ ...effect, breakOnMove: true }]);
    r.step(); expect(r.shield()).toHaveLength(1); const digest = r.world.digest(); r.shield()[0]!.moveBreakAnchor!.x++;
    expect(r.world.digest()).not.toBe(digest);
    r.effects([effect]); r.place(r.caster, -5); r.step(); expect(r.shield()).toHaveLength(1);
    expect(r.shield()[0]!.moveBreakAnchor).toBeUndefined(); expect(r.events.some(e => e.type === "shieldBroken")).toBe(false);
  });
  it("rejects non-interval stillness filters and ambiguous merging of moving shields", () => {
    expect(zHookDef.safeParse({ on: "onInterval", stationaryForSec: 1, effects: [] }).success).toBe(true);
    expect(zHookDef.safeParse({ on: "onDamageTaken", stationaryForSec: 1, effects: [] }).success).toBe(false);
    expect(zEffectDef.safeParse({ kind: "shield", amount: { flat: 100 }, duration: 2, breakOnMove: true }).success).toBe(true);
    expect(zEffectDef.safeParse({ kind: "shield", amount: { flat: 100 }, duration: 2, breakOnMove: true, stackKey: "test", onExisting: "stack" }).success).toBe(false);
  });
});
