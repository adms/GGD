import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { abilityMotionSnapshot } from "../../../sim/movement/abilityMotion";
import { armFacingLock } from "../../../sim/facingLock";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { len, dist } from "../../../sim/math/vec2";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { zEffectDef } from "../../schema/effect";
import { runHeroAbilityScenario } from "../scenario";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";
import type { EntityId } from "../../../ids";
import type { Order } from "../../../sim/intents";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup() {
  const r = communityCombatFixture("26");
  r.world.combatActive = true;
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 }, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map(z => ({ ...z, obstacles: [] })) });
  const origin = { ...r.world.arena.zones[0]!.center };
  const pos = (x: number, z = 0) => ({ x: origin.x + x, z: origin.z + z });
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = pos(x, z); r.world.transform.get(id)!.facing = { x: 1, z: 0 }; r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.enemy, 6); place(r.ally, -10, -8); place(r.distant, -10, 8);
  for (const id of [r.caster, r.enemy, r.ally, r.distant]) {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [
      { stat: Stat.AttackRange, op: ModOp.Override, value: 0 }, { stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 },
    ] }); recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  }
  const events: typeof r.world.events = [];
  const step = (n = 1, order?: Order) => {
    for (let i = 0; i < n; i++) {
      const seat = r.world.team.get(r.caster)!.seatId;
      r.world.step(order && i === 0 ? new Map([[seat, { commands: [], order }]]) : new Map()); events.push(...r.world.events);
    }
  };
  const cast = (slot: "E" | "EX", ticks = 4) => {
    const result = castAbility(r.world, r.caster, slot, slot === "E" ? { type: "self" } : { type: "dir", dir: { x: 1, z: 0 } });
    if (result === "ok") step(ticks); return result;
  };
  const wall = (x: number) => { r.world.arena.zones[0]!.obstacles.push({ kind: "segment", a: pos(x, -10), b: pos(x, 10) }); };
  const body = (id = r.caster) => r.world.transform.get(id)!;
  const phase = (id = r.caster) => abilityMotionSnapshot(r.world, id).motionState;
  const effects = (list: EffectDef[], target = r.caster) => runEffects(list, { world: r.world, caster: r.caster, targets: [target], rank: 1, origin: "test:motion", rng: r.world.rng });
  return { ...r, pos, place, step, cast, wall, body, phase, effects, events };
}

describe("GH#1132 Conan source-owned ride and bounded grapple", () => {
  it("E accelerates to the enhanced stat speed, and holds no permanent movement override", () => {
    const r = setup(); r.place(r.enemy, 15, 8); const normal = r.world.stats.get(r.caster)!.final[Stat.MoveSpeed];
    expect(r.cast("E")).toBe("ok"); r.step(1, { kind: "move", point: r.pos(18) });
    const initial = len(r.body().vel); expect(r.phase()).toBe("accelerating");
    r.step(10); expect(len(r.body().vel)).toBeGreaterThan(initial); expect(len(r.body().vel)).toBeGreaterThan(normal);
    expect(r.phase()).toBe("cruising"); expect(r.world.nav.get(r.caster)!.override).toBeNull();
  });
  it("E has a real sharp-turn speed reduction and bounded smooth direction change", () => {
    const r = setup(); r.place(r.enemy, 15, 8); r.cast("E"); r.step(12, { kind: "move", point: r.pos(18) });
    const speed = len(r.body().vel); r.step(1, { kind: "move", point: r.pos(-12) });
    expect(r.phase()).toBe("turning"); expect(len(r.body().vel)).toBeLessThan(speed * 0.4);
    expect(r.body().facing.x).toBeGreaterThan(0); r.step(14); expect(r.body().facing.x).toBeLessThan(0);
  });
  it("E keeps steering independent of explicit aim and the committed cast facing", () => {
    const r = setup(); r.place(r.enemy, 15, 8); r.cast("E"); r.step(12, { kind: "move", point: r.pos(18) });
    armFacingLock(r.world, r.caster, { x: 0, z: -1 }, 20);
    const seat = r.world.team.get(r.caster)!.seatId;
    r.world.step(new Map([[seat, { commands: [], aim: { x: 0, z: 1 } }]]));
    expect(r.body().facing).toEqual({ x: 0, z: 1 }); expect(r.body().vel.x).toBeGreaterThan(0);
    r.step(); expect(r.body().facing).toEqual({ x: 0, z: -1 }); expect(r.body().vel.x).toBeGreaterThan(0);
  });
  it.each(["open", "closed"] as const)("E and EX respect a player-held %s gate", mode => {
    const r = setup(); const zone = r.world.arena.zones[0]!;
    zone.obstacles.push({ kind: "segment", a: r.pos(3, -10), b: r.pos(3, 10), gateGroup: "test:gate" });
    zone.gateHolds = [{ at: r.pos(-10, -8), radius: 1, gateGroup: "test:gate", mode: mode === "open" ? "open" : "close" }];
    r.world.gateSchedule = { kind: "periodic", periodTicks: 1000, telegraphTicks: 0, configurations: mode === "open" ? [["test:gate"], []] : [[], ["test:gate"]] };
    r.cast("EX"); expect(r.phase(mode === "open" ? r.enemy : r.caster)).toBe("pulling");
    r.step(25); r.place(r.caster, 0); r.place(r.enemy, 15, 8);
    r.cast("E"); r.step(30, { kind: "move", point: r.pos(10) });
    if (mode === "open") expect(r.body().pos.x).toBeGreaterThan(r.pos(3).x);
    else { expect(r.phase()).toBe("collision"); expect(r.body().pos.x).toBeLessThan(r.pos(3).x); }
  });
  it("hold brakes over time before stopped; E expiry removes only its own source", () => {
    const r = setup(); r.place(r.enemy, 15, 8); r.cast("E"); r.step(12, { kind: "move", point: r.pos(18) });
    const speed = len(r.body().vel), start = { ...r.body().pos };
    r.step(1, { kind: "hold" }); expect(r.phase()).toBe("braking"); expect(len(r.body().vel)).toBeLessThan(speed);
    r.step(8); expect(r.phase()).toBe("stopped"); expect(len(r.body().vel)).toBe(0); expect(dist(start, r.body().pos)).toBeGreaterThan(0);
    r.step(100); expect(r.phase()).toBe(""); expect(r.world.stats.get(r.caster)!.sources.some(s => s.id === "test:durable")).toBe(true);
  });
  it.each(["wall", "body"] as const)("E stops on %s collision without driving through it", kind => {
    const r = setup(); if (kind === "wall") { r.wall(3); r.place(r.enemy, 15, 8); } else r.place(r.enemy, 3);
    r.cast("E"); const states = [];
    r.step(1, { kind: "move", point: r.pos(10) });
    for (let i = 0; i < 45; i++) { r.step(); states.push(r.phase()); }
    expect(states).toContain("collision"); expect(r.body().pos.x).toBeLessThan(r.pos(3).x); expect(len(r.body().vel)).toBe(0);
  });
  it("E obeys real root/slow and death cleanup rather than bypassing ordinary control", () => {
    const r = setup(); r.place(r.enemy, 15, 8); r.cast("E"); r.step(12, { kind: "move", point: r.pos(18) });
    const speed = len(r.body().vel);
    r.effects([{ kind: "applyStatus", statusId: "slow30" as never, duration: 1, moveSpeedMult: 0.3 }]); r.step(); expect(len(r.body().vel)).toBeLessThan(speed * 0.4);
    r.effects([{ kind: "applyStatus", statusId: "root" as never, duration: 1, root: true }]); r.step(); expect(len(r.body().vel)).toBe(0);
    r.world.health.get(r.caster)!.alive = false; r.step(); expect(r.phase()).toBe("");
  });
  it("EX pulls the first enemy only, caps total travel and does not throw or damage", () => {
    const r = setup(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 7.5);
    const hp = r.world.health.get(r.enemy)!.hp, start = { ...r.body(r.enemy).pos }, own = { ...r.body().pos };
    expect(r.cast("EX")).toBe("ok"); expect(r.phase(r.enemy)).toBe("pulling"); r.step(25);
    expect(dist(start, r.body(r.enemy).pos)).toBeCloseTo(4, 4); expect(r.body(r.distant).pos.x).toBeCloseTo(r.pos(7.5).x);
    expect(r.body().pos).toEqual(own); expect(r.world.health.get(r.enemy)!.hp).toBe(hp); expect(r.world.airborne.size).toBe(0);
    expect(r.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.project.projectId}.ex`)).toHaveLength(0);
  });
  it("EX catches a real terrain anchor and pulls self; a nearer wall blocks the enemy branch", () => {
    const r = setup(); r.wall(5); const start = { ...r.body().pos }, enemy = { ...r.body(r.enemy).pos };
    r.cast("EX"); expect(r.phase()).toBe("pulling"); expect(r.phase(r.enemy)).toBe(""); r.step(25);
    expect(dist(start, r.body().pos)).toBeCloseTo(4, 4); expect(r.body().pos.x).toBeLessThan(r.pos(5).x); expect(r.body(r.enemy).pos).toEqual(enemy);
  });
  it.each(["empty", "far", "ally", "hidden", "immune"] as const)("EX does not invent a target/anchor for %s", mode => {
    const r = setup();
    if (mode === "empty") r.place(r.enemy, 6, 4);
    if (mode === "far") r.place(r.enemy, 10);
    if (mode === "ally") r.world.team.get(r.enemy)!.teamId = r.world.team.get(r.caster)!.teamId;
    if (mode === "hidden") attachSource(r.world, r.enemy, { id: "test:hidden", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } });
    if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", blocksControl: true, durationSec: 2 }], r.enemy);
    r.step(); const mana = r.world.health.get(r.caster)!.mana; expect(r.cast("EX")).toBe("ok");
    expect(r.phase()).toBe(""); expect(r.phase(r.enemy)).toBe(""); expect(r.world.health.get(r.caster)!.mana).toBeLessThan(mana);
  });
  it.each(["range", "zone", "dead", "settled", "wall"] as const)("EX link stops on %s after attachment", mode => {
    const r = setup(); r.cast("EX"); expect(r.phase(r.enemy)).toBe("pulling");
    if (mode === "range") {
      r.place(r.caster, -10); const before = { ...r.body(r.enemy).pos };
      r.step(); expect(r.phase(r.enemy)).toBe(""); expect(r.body(r.enemy).pos).toEqual(before);
    }
    if (mode === "zone") r.body().zone = 1;
    if (mode === "dead") r.world.health.get(r.caster)!.alive = false;
    if (mode === "settled") r.world.settledZones.add(0);
    if (mode === "wall") r.wall(4);
    r.step(10); expect(r.phase(r.enemy)).toBe("");
    if (mode === "wall") expect(r.body(r.enemy).pos.x).toBeGreaterThan(r.pos(4).x);
  });
  it("motion ramp and remaining tether travel participate in the world digest", () => {
    const r = setup(); r.cast("E"); const d = r.world.digest(); r.world.nav.get(r.caster)!.drive!.rate = 0.5; expect(r.world.digest()).not.toBe(d);
    r.cast("EX"); const ov = r.world.nav.get(r.enemy)!.override!; if (ov.kind === "leap") throw new Error("wrong override");
    const g = r.world.digest(); ov.remaining -= 0.1; expect(r.world.digest()).not.toBe(g);
  });
  it("schema rejects mixed legacy pull/anchor semantics; the real EX keeps its cooldown", () => {
    const r = setup(); const e = r.compiled.abilityDrafts.EX.effects[0]!;
    expect(zEffectDef.safeParse({ ...e, destination: "anchorRing" }).success).toBe(false);
    expect(r.cast("EX")).toBe("ok"); expect(r.cast("EX")).toBe("cooldown");
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBeGreaterThan(0);
  });
  it("the Editor movement setup creates real accelerating, turning and braking replay frames", () => {
    const r = setup(); const result = runHeroAbilityScenario(r.compiled.champion as unknown as ChampionDef, r.compiled.abilityDrafts.E as unknown as AbilityDef, {
      baseline: createHeroSimulationBaseline(r.source.catalog.documents), ticks: 110,
      relatedAbilities: Object.values(r.compiled.abilityDrafts) as unknown as AbilityDef[],
      setup: { ...DEFAULT_HERO_SCENARIO_SETUP, movementOrders: [
        { atSec: 0.2, kind: "move", x: -3, z: 10 }, { atSec: 1.3, kind: "move", x: -11, z: -6 }, { atSec: 2.2, kind: "hold" },
      ] },
    });
    expect(result.status).toBe("accepted");
    const states = result.events.filter(e => e.type === "abilityMotion").map(e => e.data.motionState);
    expect(states).toEqual(expect.arrayContaining(["accelerating", "turning", "braking", "stopped", ""]));
  });
  it("the Editor wall setup catches a genuine anchor and publishes its exact collision dimensions", () => {
    const r = setup(); const result = runHeroAbilityScenario(r.compiled.champion as unknown as ChampionDef, r.compiled.abilityDrafts.EX as unknown as AbilityDef, {
      baseline: createHeroSimulationBaseline(r.source.catalog.documents), ticks: 60,
      relatedAbilities: Object.values(r.compiled.abilityDrafts) as unknown as AbilityDef[],
      setup: { ...DEFAULT_HERO_SCENARIO_SETUP, obstacle: { x: 1, z: 0 } },
    });
    expect(result.status).toBe("accepted"); expect(result.events.find(e => e.type === "previewObstacle")?.data).toMatchObject({ halfW: 0.15, halfD: 3 });
    const link = result.events.find(e => e.type === "abilityMotion" && e.data.motionState === "pulling");
    expect(link).toBeDefined(); expect(link?.actorPose.caster.x).not.toBe(result.events[0]?.actorPose.caster.x);
  });
});
