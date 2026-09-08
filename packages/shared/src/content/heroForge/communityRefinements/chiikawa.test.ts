/** GH#1141: original recipe -> versioned refinement -> compiler -> real casts. */
import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { clearForFreshBody, clearRoundScoped } from "../../../sim/clearPools";
import { resetMarksForRound } from "../../../sim/marks";
import { evaluateCondition } from "../../../sim/content/condition";
import { zEffectCondition } from "../../schema/condition";
import { zEffectDef } from "../../schema/effect";
import { Statuses } from "../../../sim/content/registry";
import { hasStatusTag } from "../../../sim/content/condition";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { asSeatId, type EntityId, type StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityCombatFixture("37", rank);
  // Training geometry stays fixed under damage; movement effects still execute.
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 }, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  const start = { ...r.world.transform.get(r.caster)!.pos };
  const events: typeof r.world.events = [];
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [{ stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 }, { stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }] });
    recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  }
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = { x: start.x + x, z: start.z + z };
    r.world.transform.get(id)!.facing = { x: 1, z: 0 };
    r.world.nav.get(id)!.order = { kind: "hold" }; r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.ally, -3); place(r.enemy, 8); place(r.distant, -12);
  const step = (n = 45) => { for (let i = 0; i < n; i++) { r.world.step(new Map()); events.push(...r.world.events); } };
  const damage = (source = r.enemy, target = r.ally, amount = 10) => {
    r.world.damageQueue.push({ source, target, amount, type: "true", origin: "test:combat", crit: false }); step(1);
  };
  const resource = (id = r.caster) => r.world.marks.get(id)!.get(`${r.project.projectId}.courage` as StatusId)!.count;
  const charge = (n: number) => {
    r.world.combatActive = true;
    for (let i = 0; i < n; i++) { damage(); step(60); }
    expect(resource()).toBe(n); r.world.combatActive = false;
  };
  const ready = (slot: CastableSlot) => {
    abilityInstanceFor(r.world.abilities.get(r.caster)!, slot)!.cooldownRemainingTicks = 0;
    r.world.health.get(r.caster)!.mana = r.world.health.get(r.caster)!.maxMana;
  };
  const cast = (slot: CastableSlot, n = 45, dir = { x: 1, z: 0 }) => {
    const from = events.length; const before = r.world.events.length;
    const result = castAbility(r.world, r.caster, slot, slot === "E" || slot === "EX" ? { type: "self" } : { type: "dir", dir });
    events.push(...r.world.events.slice(before)); if (result === "ok") step(n);
    return { result, events: events.slice(from) };
  };
  const hits = (slot: CastableSlot) => events.filter(e => e.type === "damage" && e.data.source === r.caster && e.data.origin === `ability:${r.project.projectId}.${slot.toLowerCase()}`);
  const nearby = () => evaluateCondition(r.world, { kind: "nearbyCombat", subject: "self", radius: 5, withinSec: 2 }, { self: r.caster });
  return { ...r, start, events, place, step, damage, resource, charge, ready, cast, hits, nearby };
}

describe("GH#1141 Chiikawa courage and six authored slots", () => {
  it("earns courage from allies dealing OR taking actual damage, once per interval, capped at three", () => {
    const r = setup(); r.world.combatActive = true;
    r.step(90); expect(r.resource()).toBe(0);
    r.damage(r.ally, r.enemy); r.step(1); expect(r.resource()).toBe(1);
    for (let i = 0; i < 20; i++) r.damage();
    expect(r.resource()).toBe(1); r.step(40); expect(r.resource()).toBe(2);
    for (let i = 0; i < 130; i++) r.damage();
    expect(r.resource()).toBe(3);
    expect(r.events.filter(e => e.type === "damage" && e.data.source === r.caster)).toHaveLength(0);
  });
  it("does not count isolated self combat, enemies, friendly damage, self harm or zero damage", () => {
    for (const pair of ["self", "friendly", "selfHarm", "zero"] as const) {
      const r = setup(); r.world.combatActive = true;
      if (pair === "self") r.damage(r.caster, r.enemy);
      if (pair === "friendly") r.damage(r.caster, r.ally);
      if (pair === "selfHarm") r.damage(r.ally, r.ally);
      if (pair === "zero") r.damage(r.enemy, r.ally, 0);
      r.step(5); expect(r.resource(), pair).toBe(0);
    }
  });
  it("uses live range, zone and life state and expires its recent-combat window", () => {
    const r = setup(); r.world.combatActive = true; r.damage(); expect(r.nearby()).toBe(true);
    r.place(r.ally, -5.01); expect(r.nearby()).toBe(false);
    r.place(r.ally, -5); expect(r.nearby()).toBe(true);
    const zone = r.world.transform.get(r.ally)!.zone;
    r.world.transform.get(r.ally)!.zone = zone + 1; expect(r.nearby()).toBe(false);
    r.world.transform.get(r.ally)!.zone = zone;
    r.world.health.get(r.ally)!.alive = false; expect(r.nearby()).toBe(false);
    r.world.health.get(r.ally)!.alive = true; r.step(62); expect(r.nearby()).toBe(false);
    r.damage(); expect(r.nearby()).toBe(true);
    r.world.settledZones.add(zone); expect(r.nearby()).toBe(false);
  });
  it("counts shield impact and non-champion combat, but not invulnerable hits", () => {
    const r = setup(); r.world.combatActive = true;
    runEffects([{ kind: "shield", amount: { flat: 100 }, duration: 10 }], { world: r.world, caster: r.ally, targets: [r.ally], rank: 1, origin: "test:shield", rng: r.world.rng });
    const hp = r.world.health.get(r.ally)!.hp;
    r.damage(); expect(r.world.health.get(r.ally)!.hp).toBe(hp); expect(r.nearby()).toBe(true);
    clearForFreshBody(r.world, r.ally); clearForFreshBody(r.world, r.enemy);
    r.world.champion.delete(r.enemy); r.damage(r.ally, r.enemy); expect(r.nearby()).toBe(true);
    clearForFreshBody(r.world, r.ally); clearForFreshBody(r.world, r.enemy);
    runEffects([{ kind: "invulnerable", durationSec: 1 }], { world: r.world, caster: r.ally, targets: [r.ally], rank: 1, origin: "test:immune", rng: r.world.rng });
    r.damage(); expect(r.nearby()).toBe(false);
  });
  it("clears combat history on fresh body and round, with deterministic history in the digest", () => {
    const r = setup(); r.world.combatActive = true; r.damage();
    const digest = r.world.digest(); const tick = r.world.combatActivity.get(r.ally)!;
    r.world.combatActivity.set(r.ally, tick - 1); expect(r.world.digest()).not.toBe(digest);
    r.world.combatActivity.set(r.ally, tick);
    const entries = [...r.world.combatActivity]; r.world.combatActivity.clear();
    for (const [id, at] of entries.reverse()) r.world.combatActivity.set(id, at);
    expect(r.world.digest()).toBe(digest);
    clearForFreshBody(r.world, r.ally); expect(r.nearby()).toBe(false);
    r.damage(); clearRoundScoped(r.world, r.ally); expect(r.nearby()).toBe(false);
    resetMarksForRound(r.world); expect(r.resource()).toBe(0);
  });
  it.each([1, 4])("rank %i Q is a single short forward stab with no side/back/ally hits", rank => {
    const r = setup(rank); r.place(r.enemy, 1.5); r.place(r.ally, 1.5, 0.1);
    expect(r.cast("Q").result).toBe("ok"); expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]);
    for (const [x, z] of [[-2, 0], [1, 2], [4, 0]]) {
      r.ready("Q"); r.place(r.enemy, x!, z!); const old = r.hits("Q").length;
      expect(r.cast("Q").result).toBe("ok"); expect(r.hits("Q")).toHaveLength(old);
    }
  });
  it.each([0, 1, 3])("W with %i courage retreats in the requested direction and consumes at most one", n => {
    const r = setup(); r.charge(n); r.place(r.enemy, 1.5);
    const initial = { ...r.world.transform.get(r.caster)!.pos };
    expect(r.cast("W", 20, { x: 0, z: -1 }).result).toBe("ok");
    const end = r.world.transform.get(r.caster)!.pos;
    expect(end.x).toBeCloseTo(initial.x); expect(end.z).toBeCloseTo(initial.z - 3);
    expect(r.resource()).toBe(Math.max(0, n - 1)); expect(r.shield(r.caster) > 0).toBe(n > 0);
    expect(r.shield(r.ally)).toBe(0); expect(r.hits("W")).toHaveLength(0);
  });
  it("a rejected W does not spend courage or grant its shield", () => {
    const r = setup(); r.charge(1); r.world.health.get(r.caster)!.mana = 0;
    expect(r.cast("W", 5).result).not.toBe("ok"); expect(r.resource()).toBe(1);
    expect(r.shield(r.caster)).toBe(0); expect(r.world.transform.get(r.caster)!.pos).toEqual(r.start);
  });
  it("W stops at a wall rather than leaping across it", () => {
    const r = setup(); const zone = r.world.arena.zones[0]!;
    // The fixture owns its obstacle array for this case; restore shared arena afterward.
    const previous = zone.obstacles;
    zone.obstacles = [...previous, { kind: "circle", center: { x: r.start.x + 2, z: r.start.z }, radius: 0.5 }];
    try { expect(r.cast("W", 30).result).toBe("ok"); expect(r.world.transform.get(r.caster)!.pos.x - r.start.x).toBeLessThan(1.5); }
    finally { zone.obstacles = previous; }
  });
  it("E stays still and heals only after the one-second cast completes", () => {
    const r = setup(); r.world.health.get(r.caster)!.hp -= 1000;
    const before = r.world.health.get(r.caster)!.hp;
    expect(r.cast("E", 10).result).toBe("ok"); expect(r.world.health.get(r.caster)!.hp).toBe(before);
    expect(r.world.abilities.get(r.caster)!.cast).not.toBeNull();
    r.world.step(new Map([[asSeatId(0), { order: { kind: "move" as const, point: { x: r.start.x + 5, z: r.start.z } }, commands: [] }]]));
    r.step(5);
    expect(r.world.transform.get(r.caster)!.pos).toEqual(r.start);
    r.step(30); expect(r.world.health.get(r.caster)!.hp).toBeGreaterThan(before);
    expect(r.world.health.get(r.ally)!.hp).toBe(r.world.health.get(r.ally)!.maxHp);
  });
  it("HP damage interrupts E without a delayed heal; a fully absorbed hit does not", () => {
    for (const shielded of [false, true]) {
      const r = setup(); r.world.health.get(r.caster)!.hp -= 1000;
      if (shielded) runEffects([{ kind: "shield", amount: { flat: 100 }, duration: 5 }], { world: r.world, caster: r.caster, targets: [r.caster], rank: 1, origin: "test:shield", rng: r.world.rng });
      expect(r.cast("E", 5).result).toBe("ok"); r.damage(r.enemy, r.caster, 10);
      const after = r.world.health.get(r.caster)!.hp; r.step(40);
      expect(r.world.health.get(r.caster)!.hp > after, String(shielded)).toBe(shielded);
    }
  });
  it.each([0, 1, 2, 3])("R consumes %i courage for exactly 3+n separated short-range strikes", n => {
    const r = setup(); r.charge(n); r.place(r.enemy, 1.5);
    expect(r.cast("R", 70).result).toBe("ok"); expect(r.resource()).toBe(0);
    expect(r.hits("R")).toHaveLength(3 + n);
    const ticks = r.hits("R").map(e => e.tick);
    expect(new Set(ticks).size).toBe(3 + n);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBe(5);
  });
  it.each(["range", "death", "settlement"])("R stops hitting after %s changes between strikes", reason => {
    const r = setup(); r.charge(3); r.place(r.enemy, 1.5); expect(r.cast("R", 0).result).toBe("ok");
    for (let i = 0; i < 40 && r.hits("R").length === 0; i++) r.step(1);
    expect(r.hits("R")).toHaveLength(1);
    if (reason === "range") r.place(r.enemy, 8);
    if (reason === "death") { r.world.health.get(r.caster)!.hp = 0; r.world.health.get(r.caster)!.alive = false; }
    if (reason === "settlement") r.world.settledZones.add(0);
    r.step(45); expect(r.hits("R")).toHaveLength(1);
  });
  it("multiple nearby allies do not accelerate the shared courage clock", () => {
    const r = setup(); r.place(r.distant, -4); r.world.combatActive = true;
    r.damage(r.enemy, r.ally); r.step(1); expect(r.resource()).toBe(1);
    for (let i = 0; i < 20; i++) { r.damage(r.enemy, r.ally); r.damage(r.enemy, r.distant); }
    expect(r.resource()).toBe(1);
    expect(r.resource(r.ally)).toBeGreaterThan(0);
  });
  it("EX clears only dispellable fear on nearby friends and protects for a finite window", () => {
    const r = setup();
    Statuses.register("test.fear", { polarity: "debuff", tags: ["fear", "cc"] });
    Statuses.register("test.stun", { polarity: "debuff", tags: ["stun", "cc"] });
    const apply = (id: EntityId, locked = false) => runEffects([
      zEffectDef.parse({ kind: "applyStatus", statusId: "test.fear", feared: true, duration: 5, dispellable: !locked }),
      zEffectDef.parse({ kind: "applyStatus", statusId: "test.stun", stun: true, duration: 5 }),
    ], { world: r.world, caster: r.enemy, targets: [id], rank: 1, origin: "test:fear", rng: r.world.rng });
    for (const id of [r.ally, r.enemy, r.distant]) apply(id);
    expect(hasStatusTag(r.world, r.ally, "fear")).toBe(true);
    expect(r.cast("EX", 8).result).toBe("ok");
    expect(hasStatusTag(r.world, r.ally, "fear")).toBe(false);
    expect(hasStatusTag(r.world, r.ally, "stun")).toBe(true);
    for (const id of [r.enemy, r.distant]) expect(hasStatusTag(r.world, id, "fear")).toBe(true);
    apply(r.ally); expect(hasStatusTag(r.world, r.ally, "fear")).toBe(false);
    r.step(100); apply(r.ally); expect(hasStatusTag(r.world, r.ally, "fear")).toBe(true);
    // Same authored EX respects the game's non-dispellable flag.
    clearForFreshBody(r.world, r.ally); apply(r.ally, true); r.ready("EX");
    expect(r.cast("EX", 8).result).toBe("ok"); expect(hasStatusTag(r.world, r.ally, "fear")).toBe(true);
  });
  it("the selective cleanse schema cannot silently clear unrelated pools", () => {
    const effect = { kind: "dispel", shape: "single", statusTag: "fear", pools: { status: true } };
    expect(zEffectDef.safeParse(effect).success).toBe(true);
    for (const pools of [undefined, { shields: true }, { status: true, dot: true }, { status: true, buffs: true }]) expect(zEffectDef.safeParse({ ...effect, pools }).success).toBe(false);
  });
  it("preserves original source, identity, model and template isolation for all six slots", () => {
    const r = setup();
    expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.brief).toEqual(r.source.project.brief);
    expect(r.project.presentation.modelKey).toBe(r.source.project.presentation.modelKey);
    for (const s of Object.values(r.project.acceptedPlan!.slots)) for (const p of s.products) expect(p.template.contentSha256).toMatch(/^sha256:/);
    expect(r.project.refinementNotes!.Q).toContain("仍待視覺驗收");
    expect(r.project.refinementNotes!.E).toContain("仍待視覺驗收");
  });
  it("rejects unbounded/ambiguous nearby-combat conditions", () => {
    const leaf = { kind: "nearbyCombat", subject: "self", radius: 5, withinSec: 2 };
    expect(zEffectCondition.safeParse(leaf).success).toBe(true);
    for (const patch of [{ radius: 0 }, { radius: 41 }, { withinSec: 0 }, { withinSec: 11 }, { includeSelf: true }]) expect(zEffectCondition.safeParse({ ...leaf, ...patch }).success).toBe(false);
  });
});
