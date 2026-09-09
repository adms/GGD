/**
 * GH#1140: actual recipe -> independently pinned project -> compiler -> casts.
 * Mutation evidence: bypass creditedHooks.includes in hooks.ts (keeping slot
 * attribution) makes the interleaved W/Q test earn 3 instead of 2. Removing
 * EX.statusCost makes empty EX succeed. Both sources were restored afterward.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { spawnChampion } from "../../../sim/spawnChampion";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { clearRoundScoped } from "../../../sim/clearPools";
import { resetMarksForRound } from "../../../sim/marks";
import { fireHooks } from "../../../sim/effects/hooks";
import { runEffects } from "../../../sim/effects/effectRunner";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { ModOp } from "../../../sim/stats/modifiers";
import { Stat } from "../../../sim/stats/statTypes";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";

beforeAll(() => registerSkeletonContent());

function setup(rank = 1) {
  const r = communityCombatFixture("20", rank);
  // Keep the measured capsule/chain geometry fixed; no production setting is changed.
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 } };
  const start = { ...r.world.transform.get(r.caster)!.pos };
  const durable = (id: EntityId) => {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [{ stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 }] });
    recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  };
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) durable(id);
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = { x: start.x + x, z: start.z + z };
    r.world.transform.get(id)!.facing = { x: 1, z: 0 };
    r.world.nav.get(id)!.order = { kind: "hold" };
    r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.ally, -5, 5); place(r.distant, -5, -5); place(r.enemy, 2);
  let seat = 4;
  const enemyAt = (x: number, z = 0) => {
    const id = spawnChampion(r.world, { zone: 0, championId: r.compiled.champion.id,
      seatId: asSeatId(seat++), teamId: asTeamId(1), pos: { x: start.x + x, z: start.z + z }, level: 30 });
    durable(id); place(id, x, z); return id;
  };
  const resource = (name: string, id = r.caster) => r.world.marks.get(id)!.get(`${r.project.projectId}.${name}` as StatusId)!.count;
  const instance = (slot: CastableSlot) => abilityInstanceFor(r.world.abilities.get(r.caster)!, slot)!;
  const ready = (slot: CastableSlot) => {
    instance(slot).cooldownRemainingTicks = 0;
    r.world.health.get(r.caster)!.mana = r.world.health.get(r.caster)!.maxMana;
  };
  const events: typeof r.world.events = [];
  const step = (ticks = 45) => { for (let i = 0; i < ticks; i++) { r.world.step(new Map()); events.push(...r.world.events); } };
  const cast = (slot: CastableSlot, ticks = 45, target = r.enemy) => {
    const before = r.world.events.length;
    const result = castAbility(r.world, r.caster, slot, slot === "Q" || slot === "R"
      ? { type: "point", point: { ...r.world.transform.get(target)!.pos } }
      : { type: "entity", entityId: slot === "EX" || slot === "E" ? r.caster : target });
    events.push(...r.world.events.slice(before));
    if (result === "ok") step(ticks);
    return result;
  };
  const hits = (slot: CastableSlot) => events.filter(e => e.type === "damage" && e.data.source === r.caster && e.data.origin === `ability:${r.project.projectId}.${slot.toLowerCase()}`);
  const charge = (n: number) => {
    for (const slot of (["Q", "W", "Q"] as const).slice(0, n)) { ready(slot); expect(cast(slot)).toBe("ok"); }
    expect(resource("charge")).toBe(n);
  };
  return { ...r, start, place, enemyAt, resource, instance, ready, events, step, cast, hits, charge };
}

describe("GH#1140 electric charge and the next empowered cast", () => {
  it("earns only alternating successful skill hits, once per cast, capped and owner-isolated", () => {
    const r = setup(); r.enemyAt(4);
    for (const [slot, expected] of [["Q", 1], ["Q", 1], ["W", 2], ["Q", 3], ["W", 3]] as const) {
      r.ready(slot); expect(r.cast(slot)).toBe("ok"); expect(r.resource("charge")).toBe(expected);
      expect(r.resource("charge", r.ally)).toBe(0);
    }
    r.place(r.ally, 0, -2); const otherVictim = r.enemyAt(2, -2);
    expect(castAbility(r.world, r.ally, "Q", { type: "point", point: r.world.transform.get(otherVictim)!.pos })).toBe("ok");
    r.step(); expect(r.resource("charge", r.ally)).toBe(1); expect(r.resource("charge")).toBe(3);
    clearRoundScoped(r.world, r.caster); resetMarksForRound(r.world);
    expect(r.resource("charge")).toBe(0);
    r.ready("W"); expect(r.cast("W")).toBe("ok"); expect(r.resource("charge")).toBe(1);
  });

  it("does not charge on basic hooks, empty casts or damage fully absorbed by a shield", () => {
    const r = setup();
    fireHooks(r.world, r.caster, "onBasicAttack", r.enemy);
    expect(r.resource("charge")).toBe(0); expect(r.world.damageQueue).toHaveLength(0);
    r.world.damageQueue.push({ source: r.caster, target: r.enemy, amount: 100, type: "physical", origin: "basic", crit: false });
    r.step(); expect(r.resource("charge")).toBe(0);
    expect(r.events.some(e => e.type === "damage" && e.data.origin === "basic" && Number(e.data.amount) > 0)).toBe(true);
    r.place(r.enemy, 12); expect(r.cast("Q", 45, r.enemy)).toBe("ok");
    expect(r.resource("charge")).toBe(0);
    r.place(r.enemy, 2);
    // Put a larger shield on the victim through the effect engine; a real Q must lose no HP.
    runEffects([{ kind: "shield", amount: { flat: 10000 }, duration: 10 }],
      { world: r.world, caster: r.enemy, targets: [r.enemy], rank: 1, origin: "test:shield", rng: r.world.rng });
    const hp = r.world.health.get(r.enemy)!.hp; const shield = r.shield(r.enemy);
    r.ready("Q"); expect(r.cast("Q")).toBe("ok");
    expect(r.shield(r.enemy)).toBeLessThan(shield); expect(r.world.health.get(r.enemy)!.hp).toBeGreaterThanOrEqual(hp);
    expect(r.hits("Q").every(e => e.data.amount === 0)).toBe(true);
    expect(r.resource("charge")).toBe(0);
  });

  it.each([1, 4])("rank %i Q and R pay once per inline victim, with R after its windup", rank => {
    const r = setup(rank); const second = r.enemyAt(4); const side = r.enemyAt(4, 3); const behind = r.enemyAt(-3);
    r.place(r.ally, 6);
    expect(r.cast("Q")).toBe("ok");
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy, second]);
    const qDamage = r.hits("Q")[0]!.data.amount as number;
    expect(r.cast("R", 0)).toBe("ok");
    expect(r.world.abilities.get(r.caster)!.cast).not.toBeNull();
    r.step(2); expect(r.hits("R")).toHaveLength(0);
    r.step(43);
    expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy, second]);
    expect(r.hits("R")[0]!.data.amount).toBeGreaterThan(qDamage);
    expect(r.events.some(e => e.type === "damage" && [side, behind, r.ally].includes(e.data.target as EntityId))).toBe(false);
  });

  it("does not count a late W hop again when Q hits between hops of the same cast", () => {
    const r = setup(); r.charge(3); expect(r.cast("EX")).toBe("ok");
    // Existing owner setting: without hitstop, Q can finish between W hops.
    // The cast-credit guard must hold in this supported timing configuration too.
    r.world.combatFeel = { ...r.world.combatFeel, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
    r.place(r.enemy, 3, -0.7);
    for (const [x, z] of [[1.6, -0.7], [4.4, -0.7], [1.6, 0.7], [3, 0.7], [4.4, 0.7]]) r.enemyAt(x!, z!);
    r.events.length = 0; r.ready("W"); r.ready("Q");
    expect(r.cast("W", 0)).toBe("ok");
    for (let i = 0; i < 30 && r.hits("W").length === 0; i++) r.step(1);
    expect(r.hits("W")).toHaveLength(1); expect(r.resource("charge")).toBe(1);
    expect(r.cast("Q")).toBe("ok");
    expect(r.hits("W")).toHaveLength(6);
    expect(r.hits("W").at(-1)!.tick).toBeGreaterThan(r.hits("Q")[0]!.tick);
    expect(r.resource("charge")).toBe(2);
  });

  it("reselects an enemy that dies between W hops and keeps the three-hit limit", () => {
    const r = setup(); r.enemyAt(3.4); r.enemyAt(4.8); r.enemyAt(3.4, 1.4);
    expect(r.cast("W", 0)).toBe("ok");
    for (let i = 0; i < 30 && r.hits("W").length === 0; i++) r.step(1);
    const pending = r.world.chainLightning[0]!.strands[0]!.target;
    r.world.health.get(pending)!.hp = 0; r.world.health.get(pending)!.alive = false;
    r.step();
    expect(r.hits("W")).toHaveLength(3);
    expect(r.hits("W").map(e => e.data.target)).not.toContain(pending);
    expect(r.resource("charge")).toBe(1); expect(r.world.chainLightning).toHaveLength(0);
  });

  it.each([1, 2, 3])("EX spends exactly %i charges and widens only the next Q", n => {
    const r = setup(); r.charge(n);
    const wide = r.enemyAt(4, 1 + n * 0.2 - 0.05);
    expect(r.cast("EX")).toBe("ok");
    expect(r.resource("charge")).toBe(0); expect(r.resource("overload")).toBe(n);
    expect(r.resource("overload", r.ally)).toBe(0);
    const old = r.hits("Q").length;
    r.ready("Q"); expect(r.cast("Q")).toBe("ok");
    expect(r.hits("Q").slice(old).map(e => e.data.target)).toContain(wide);
    expect(r.resource("overload")).toBe(0);
    const next = r.hits("Q").length;
    r.ready("Q"); expect(r.cast("Q")).toBe("ok");
    expect(r.hits("Q").slice(next).map(e => e.data.target)).not.toContain(wide);
    expect(r.events.some(e => e.type === "floatingText" && String(e.data.text).includes("強化電擊"))).toBe(true);
  });

  it.each([0, 1, 2, 3])("W uses one non-revisiting chain for %i overload charges", n => {
    const r = setup(); r.charge(n);
    // Six distinct bodies, each within 3 units of every other body.
    r.place(r.enemy, 3, -0.7);
    for (const [x, z] of [[1.6, -0.7], [4.4, -0.7], [1.6, 0.7], [3, 0.7], [4.4, 0.7]]) r.enemyAt(x!, z!);
    if (n > 0) expect(r.cast("EX")).toBe("ok");
    const old = r.hits("W").length;
    r.ready("W"); expect(r.cast("W")).toBe("ok");
    const hits = r.hits("W").slice(old);
    expect(hits).toHaveLength(3 + n);
    expect(new Set(hits.map(e => e.data.target)).size).toBe(3 + n);
    expect(hits.filter(e => e.data.target === r.enemy)).toHaveLength(1);
    expect(new Set(hits.map(e => e.tick)).size).toBe(3 + n);
    expect(r.resource("overload")).toBe(0);
    r.ready("W"); const next = r.hits("W").length; expect(r.cast("W")).toBe("ok");
    expect(r.hits("W").slice(next)).toHaveLength(3);
  });

  it("keeps the pending empowerment through E/R and illegal W, then consumes it on W", () => {
    const r = setup(); r.charge(2); expect(r.cast("EX")).toBe("ok");
    expect(r.cast("E")).toBe("ok"); expect(r.cast("R")).toBe("ok");
    expect(r.resource("overload")).toBe(2);
    r.ready("W"); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("W", 0, r.ally)).not.toBe("ok");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    expect(r.instance("W").cooldownRemainingTicks).toBe(0); expect(r.resource("overload")).toBe(2);
    expect(r.cast("W")).toBe("ok"); expect(r.resource("overload")).toBe(0);
  });

  it("rejects empty EX without mana/cooldown and clears prepared charge at round reset", () => {
    const r = setup(); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", 0)).not.toBe("ok");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(r.instance("EX").cooldownRemainingTicks).toBe(0);
    r.charge(3); expect(r.cast("EX")).toBe("ok");
    clearRoundScoped(r.world, r.caster); resetMarksForRound(r.world);
    expect(r.resource("charge")).toBe(0); expect(r.resource("overload")).toBe(0);
  });

  it("keeps the full original design and independently pinned old project", () => {
    const r = setup();
    expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.brief).toEqual(r.source.project.brief);
    expect(r.project.revision).toBe(r.source.project.revision + r.source.refinement.version);
    expect(r.source.project.acceptedPlan!.slots.PASSIVE.products[0]!.template.ref).toBe("tpl-on-attack");
    expect(r.project.acceptedPlan!.slots.PASSIVE.products[0]!.template.ref).toBe("tpl-mark-stacks");
  });
});
