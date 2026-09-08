import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Projectiles, Statuses } from "../../../sim/content/registry";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { addShield } from "../../../sim/combat/damage";
import { healTarget } from "../../../sim/combat/restore";
import { worldHookSystem } from "../../../sim/systems/WorldHookSystem";
import { resetMarksForRound } from "../../../sim/marks";
import { clearForFreshBody } from "../../../sim/clearPools";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { zEffectDef } from "../../schema/effect";
import type { EntityId, ProjectileId, StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";
import type { EffectDef } from "../../../sim/effects/effect";
import type { ProjectileDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityCombatFixture("21", rank);
  for (const [key, doc] of r.source.catalog.documents) {
    if (key.startsWith("projectiles/")) Projectiles.register(key.slice(12) as ProjectileId, doc as unknown as ProjectileDef);
  }
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 }, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [
      { stat: Stat.AttackRange, op: ModOp.Override, value: 0 },
      { stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 }, { stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }] });
    recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  }
  const start = { ...r.world.transform.get(r.caster)!.pos };
  const events: typeof r.world.events = [];
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = { x: start.x + x, z: start.z + z };
    r.world.transform.get(id)!.facing = { x: 1, z: 0 }; r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.ally, -2); place(r.enemy, 4); place(r.distant, -15);
  r.world.combatActive = true;
  const step = (n = 12) => { for (let i = 0; i < n; i++) { r.world.step(new Map()); events.push(...r.world.events); } };
  const ready = (slot: CastableSlot, caster = r.caster) => {
    abilityInstanceFor(r.world.abilities.get(caster)!, slot)!.cooldownRemainingTicks = 0;
    r.world.health.get(caster)!.mana = r.world.health.get(caster)!.maxMana;
  };
  const cast = (slot: CastableSlot, target = r.ally, caster = r.caster, ticks = 12) => {
    const input = slot === "Q" ? { type: "dir" as const, dir: { x: 1, z: 0 } } : slot === "R"
      ? { type: "point" as const, point: { ...r.world.transform.get(target)!.pos } }
      : slot === "E" ? { type: "self" as const } : { type: "entity" as const, entityId: target };
    const result = castAbility(r.world, caster, slot, input); if (result === "ok") step(ticks); return result;
  };
  const hope = (id = r.caster) => r.world.marks.get(id)!.get(`${r.project.projectId}.hope` as StatusId)!.count;
  const salvation = (id = r.ally) => r.world.marks.get(id)?.get(`${r.project.projectId}.salvation` as StatusId);
  const damage = (amount = 10, target = r.ally, source = r.enemy) => {
    r.world.damageQueue.push({ source, target, amount, type: "true", origin: "test:hostile", crit: false }); step(1);
  };
  const effects = (list: EffectDef[], target: EntityId, caster = r.caster) => runEffects(list, {
    world: r.world, caster, targets: [target], rank: 1, origin: "test:authored", rng: r.world.rng,
  });
  const heal = (amount: number, target = r.ally, source = r.caster) => {
    r.world.events.length = 0;
    const applied = healTarget(r.world, { source, target, amount, origin: "test:heal", score: true });
    worldHookSystem(r.world); r.world.events.length = 0; return applied;
  };
  const hits = (slot: string) => events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.project.projectId}.${slot.toLowerCase()}`);
  return { ...r, place, step, cast, ready, hope, salvation, damage, effects, heal, events, hits };
}

describe("GH#1132 Madoka effective protection and authored six slots", () => {
  it("charges only for actual allied HP restored, caps at three, and excludes overheal/self/enemies", () => {
    const r = setup(); r.heal(100); expect(r.hope()).toBe(0);
    r.world.health.get(r.ally)!.hp -= 10; expect(r.heal(100)).toBe(10); expect(r.hope()).toBe(1);
    for (const id of [r.caster, r.enemy]) { r.world.health.get(id)!.hp -= 20; r.heal(10, id); }
    expect(r.hope()).toBe(1);
    for (let i = 0; i < 5; i++) { r.world.health.get(r.ally)!.hp -= 10; r.heal(10); }
    expect(r.hope()).toBe(3); resetMarksForRound(r.world); expect(r.hope()).toBe(0);
    expect(r.hits("PASSIVE")).toHaveLength(0);
  });
  it("W generation/refresh is not protection; real shield absorption credits its caster once per packet", () => {
    const r = setup(); expect(r.cast("W")).toBe("ok"); expect(r.hope()).toBe(0);
    r.ready("W"); expect(r.cast("W")).toBe("ok"); expect(r.hope()).toBe(0);
    addShield(r.world, r.ally, 20, 3, "test:second-pool", "all", undefined, r.caster);
    const hp = r.world.health.get(r.ally)!.hp; r.damage(130);
    expect(r.world.health.get(r.ally)!.hp).toBe(hp); expect(r.hope()).toBe(1); expect(r.hope(r.ally)).toBe(0);
    r.damage(5); expect(r.hope()).toBe(2);
  });
  it("expired, zero, immune, self and friendly-fire shields do not charge hope", () => {
    for (const kind of ["expired", "zero", "immune", "self", "friendly"] as const) {
      const r = setup(); const target = kind === "self" ? r.caster : r.ally;
      addShield(r.world, target, kind === "zero" ? 0 : 100, kind === "expired" ? 0 : 3, "test:guard", "all", undefined, r.caster);
      if (kind === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 1 }], target);
      r.damage(10, target, kind === "friendly" ? r.caster : r.enemy); expect(r.hope(), kind).toBe(0);
    }
  });
  it("merged shield pools preserve contributor credit through weaker refresh, replace, stack and unowned remainder", () => {
    for (const mode of ["keepLarger", "replace", "stack"] as const) {
      const r = setup(); r.place(r.distant, -3);
      const stack = { stackKey: "shared", onExisting: mode };
      addShield(r.world, r.ally, 50, 3, "first", "all", stack, r.caster);
      addShield(r.world, r.ally, 20, 3, "second", "all", stack, r.distant);
      r.damage(60);
      expect(r.hope(), mode).toBe(mode === "replace" ? 0 : 1);
      expect(r.hope(r.distant), mode).toBe(mode === "keepLarger" ? 0 : 1);
    }
    const r = setup(); const stack = { stackKey: "shared", onExisting: "stack" as const };
    addShield(r.world, r.ally, 50, 3, "legacy", "all", stack);
    addShield(r.world, r.ally, 20, 3, "known", "all", stack, r.caster);
    r.damage(40); expect(r.hope()).toBe(0); r.damage(15); expect(r.hope()).toBe(1);
  });
  it.each([1, 4])("rank %i W consumes one hope for the selected ally and preserves zero-hope fallback", rank => {
    const r = setup(rank); expect(r.cast("W")).toBe("ok"); expect(r.shield(r.ally)).toBe(rank === 1 ? 120 : 300);
    r.damage(10); expect(r.hope()).toBe(1);
    r.ready("W"); expect(r.cast("W")).toBe("ok"); expect(r.hope()).toBe(0); expect(r.shield(r.ally)).toBe(rank === 1 ? 200 : 500);
    expect(r.shield(r.caster)).toBe(0); expect(r.shield(r.enemy)).toBe(0);
  });
  it("invalid W/EX targets do not consume resources or install a mark", () => {
    const r = setup(); r.world.health.get(r.ally)!.hp -= 20; r.heal(10); const hope = r.hope();
    for (const slot of ["W", "EX"] as const) for (const target of [r.enemy, r.distant]) {
      const mana = r.world.health.get(r.caster)!.mana;
      expect(r.cast(slot, target)).not.toBe("ok"); expect(r.hope()).toBe(hope);
      expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(r.salvation(target)).toBeUndefined();
    }
  });
  it("Q launches one traveling projectile and only hits the first collider once", () => {
    const r = setup(); r.place(r.distant, 7); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    expect(r.cast("Q", r.enemy, r.caster, 4)).toBe("ok"); expect(r.hits("Q")).toHaveLength(0);
    expect(r.world.projectile.size).toBe(1); r.step(35);
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]); expect(r.world.projectile.size).toBe(0);
    r.ready("Q"); r.place(r.enemy, 4, 3); r.place(r.distant, 16);
    expect(r.cast("Q", r.enemy, r.caster, 70)).toBe("ok"); expect(r.hits("Q")).toHaveLength(1);
  });
  it("E removes exactly one dispellable negative status, preserves other effects, and expires its speed", () => {
    const r = setup();
    for (const [id, polarity] of [["test-old", "debuff"], ["test-new", "debuff"], ["test-locked", "debuff"], ["test-good", "buff"]] as const) {
      Statuses.register(id, { polarity });
      r.effects([zEffectDef.parse({ kind: "applyStatus", statusId: id, duration: 10, dispellable: id !== "test-locked" })], r.caster);
    }
    const before = r.world.stats.get(r.caster)!.final[Stat.MoveSpeed];
    expect(r.cast("E")).toBe("ok");
    const ids = r.world.status.get(r.caster)!.effects.map(s => s.statusId);
    expect(ids).toContain("test-old"); expect(ids).not.toContain("test-new");
    expect(ids).toContain("test-locked"); expect(ids).toContain("test-good");
    const speed = r.world.status.get(r.caster)!.effects.find(s => s.statusId.endsWith(".purified-step"));
    expect(speed?.moveSpeedMult).toBe(1.1); r.step(100);
    expect(r.world.status.get(r.caster)!.effects.some(s => s.statusId.endsWith(".purified-step"))).toBe(false);
    expect(r.world.stats.get(r.caster)!.final[Stat.MoveSpeed]).toBe(before);
  });
  it("EX saves at the damage seam, grants a short protection window, and cannot be replenished by another caster", () => {
    const r = setup(); r.place(r.distant, -3); expect(r.cast("EX")).toBe("ok");
    expect(r.shield(r.ally)).toBe(0); expect(r.salvation()?.count).toBe(1);
    r.world.health.get(r.ally)!.hp = 100; r.damage(200);
    expect(r.world.health.get(r.ally)!.hp).toBe(Math.round(r.world.health.get(r.ally)!.maxHp * 0.05)); expect(r.salvation()?.count).toBe(0);
    expect(r.salvation()?.savesThisRound).toBe(1); r.damage(999999); expect(r.world.health.get(r.ally)!.alive).toBe(true);
    r.ready("EX", r.distant); expect(r.cast("EX", r.ally, r.distant)).toBe("ok");
    expect(r.salvation()?.count).toBe(0); r.step(20); r.damage(999999); expect(r.world.health.get(r.ally)!.alive).toBe(false);
  });
  it("shield absorption is resolved before lethality, with no save spent for a fully absorbed hit", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok"); r.world.health.get(r.ally)!.hp = 20;
    addShield(r.world, r.ally, 100, 5, "test:shield"); r.damage(100);
    expect(r.world.health.get(r.ally)!.hp).toBe(20); expect(r.salvation()?.count).toBe(1);
    r.damage(20); expect(r.salvation()?.count).toBe(0); expect(r.world.health.get(r.ally)!.hp).toBe(Math.round(r.world.health.get(r.ally)!.maxHp * 0.05));
  });
  it("unused EX expires; a new application does not stack saves; round reset restores eligibility", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok");
    r.ready("EX"); expect(r.cast("EX")).toBe("ok"); expect(r.salvation()?.count).toBe(1);
    r.step(160); expect(r.salvation()!.expiresAtTick).toBeLessThan(r.world.tick);
    r.ready("EX"); expect(r.cast("EX")).toBe("ok"); r.damage(999999); expect(r.salvation()?.savesThisRound).toBe(1);
    clearForFreshBody(r.world, r.ally); r.ready("EX"); expect(r.cast("EX")).toBe("ok"); expect(r.salvation()?.count).toBe(0);
    resetMarksForRound(r.world); r.ready("EX"); expect(r.cast("EX")).toBe("ok");
    expect(r.salvation()?.count).toBe(1); r.damage(999999); expect(r.world.health.get(r.ally)!.alive).toBe(true);
  });
  it("expired EX does not protect against a lethal packet", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok"); r.step(160); r.damage(999999);
    expect(r.world.health.get(r.ally)!.alive).toBe(false);
  });
  it("R resolves its three finite impacts in the selected area", () => {
    const r = setup(); expect(r.cast("R", r.enemy, r.caster, 90)).toBe("ok");
    const impacts = r.hits("R");
    expect(impacts).toHaveLength(3); expect(new Set(impacts.map(e => e.tick)).size).toBe(3);
    const count = r.hits("R").length; expect(count).toBeGreaterThan(0); r.step(90); expect(r.hits("R")).toHaveLength(count);
  });
  it("R lets enemies leave and enter between waves at the original ground point", () => {
    const r = setup(); r.place(r.distant, 12); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    expect(r.cast("R", r.enemy, r.caster, 1)).toBe("ok");
    for (let i = 0; i < 90 && r.hits("R").length === 0; i++) r.step(1);
    expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy]);
    r.place(r.enemy, 12); r.place(r.distant, 4); r.place(r.caster, -6); r.step(40);
    expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy, r.distant, r.distant]);
  });
  it("save limits survive generic counter increments and same-tick lethal bursts", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok");
    for (let i = 0; i < 2; i++) r.world.damageQueue.push({ source: r.enemy, target: r.ally, amount: 999999, type: "true", origin: "test:burst", crit: false });
    r.step(1); expect(r.world.health.get(r.ally)!.alive).toBe(true); expect(r.salvation()?.savesThisRound).toBe(1);
    r.effects([{ kind: "applyStatus", statusId: `${r.project.projectId}.salvation` as StatusId, duration: 5, stacks: 1 }], r.ally);
    expect(r.salvation()?.count).toBe(1); r.step(20); r.damage(999999); expect(r.world.health.get(r.ally)!.alive).toBe(false);
  });
  it("does not charge protection across zones or after settlement", () => {
    const r = setup(); const zone = r.world.transform.get(r.ally)!.zone;
    r.world.transform.get(r.ally)!.zone = zone + 1; r.world.health.get(r.ally)!.hp -= 100;
    r.heal(10); expect(r.hope()).toBe(0);
    r.world.transform.get(r.ally)!.zone = zone; r.world.settledZones.add(zone);
    r.heal(10); expect(r.hope()).toBe(0);
  });
  it("keeps source text/model binding and isolates newly versioned recipe products", () => {
    const r = setup(); expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.brief).toEqual(r.source.project.brief); expect(r.project.presentation.uploadedModel).toEqual(r.source.project.presentation.uploadedModel);
    expect(r.project.revision).toBe(r.source.project.revision + 2); expect(r.project.receipts).toEqual([]);
    expect(r.project.sourceDesign!.slots.EX.requiredRefinement).toContain("每目標每回合一次");
    expect(r.project.refinementNotes!.Q).toContain("待製作");
  });
  it("rejects mixed or unbounded mark authoring and fingerprints ownership/save history", () => {
    const r = setup(); const mark = r.compiled.abilityDrafts.EX.effects[0]!;
    expect(zEffectDef.safeParse({ ...mark, stun: true }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...mark, sourceScope: "caster" }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...mark, stacks: 0 }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...mark, duration: 0 }).success).toBe(false);
    expect(r.cast("EX")).toBe("ok"); const digest = r.world.digest();
    r.salvation()!.savesThisRound = 1; expect(r.world.digest()).not.toBe(digest);
    addShield(r.world, r.ally, 50, 3, "owned", "all", undefined, r.caster);
    const owned = r.world.digest(); r.world.health.get(r.ally)!.shields[0]!.credits![0]!.source = r.enemy;
    expect(r.world.digest()).not.toBe(owned);
  });
});
