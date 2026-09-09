import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Projectiles } from "../../../sim/content/registry";
import type { ProjectileDef } from "../../../sim/content/defs";
import { adjustMarkCount, resetMarksForRound } from "../../../sim/marks";
import { runEffects } from "../../../sim/effects/effectRunner";
import { hasStatus } from "../../../sim/effects/effectCommon";
import { clearPools } from "../../../sim/clearPools";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { Stat } from "../../../sim/stats/statTypes";
import { recomputeStats } from "../../../sim/stats/statPipeline";
import type { EffectDef } from "../../../sim/effects/effect";
import type { ProjectileId, StatusId } from "../../../ids";
import { azazelStatusIds } from "./azazel";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("32", rank), ids = azazelStatusIds(r.project.projectId);
  const projectile = "imported.bolt.void" as ProjectileId;
  Projectiles.register(projectile, r.source.catalog.documents.get(`projectiles/${projectile}`) as unknown as ProjectileDef);
  const target = (entityId = r.enemy) => ({ type: "entity" as const, entityId });
  const point = () => ({ type: "point" as const, point: { ...r.world.transform.get(r.enemy)!.pos } });
  const effects = (effects: EffectDef[], id = r.caster, caster = id) => runEffects(effects, {
    world: r.world, caster, targets: [id], rank, origin: "fixture", rng: r.world.rng });
  const hit = (source = r.enemy, target = r.caster, amount = 100, origin = "basic", type: "physical" | "magic" | "true" = "physical") => {
    const hp = r.world.health.get(target)!.hp;
    r.world.damageQueue.push({ source, target, amount, origin, type, crit: false }); r.step();
    return hp - r.world.health.get(target)!.hp;
  };
  const count = (id = r.caster) => r.count("negative-energy", id);
  // For isolated branch/expiry probes only. The full R→EX test earns all three.
  const seed = (id = r.caster, n = 3) => adjustMarkCount(r.world, id, ids.energy as StatusId, n);
  const status = (name: keyof typeof ids, who = r.enemy, by = r.caster) => hasStatus(r.world, who, ids[name] as StatusId, by);
  const counter = () => r.events.filter(e => e.type === "damage" && String(e.data.origin).includes("e.counter"));
  const output = (id = r.enemy) => { recomputeStats(r.world, id); return r.world.stats.get(id)!.final[Stat.OutputDamagePct]; };
  return { ...r, ids, target, point, effects, hit, count, seed, status, counter, output };
}
describe("Azazel current batch source and actual outgoing damage", () => {
  it("earns three actual casts, then R→EX reverses its own curse without extra EX damage", () => {
    const r = setup(); expect(r.count()).toBe(0);
    expect(r.cast("Q", r.target(), 12)).toBe("ok"); expect(r.count()).toBe(1);
    expect(r.cast("W", r.point(), 40)).toBe("ok"); expect(r.count()).toBe(2);
    const hp = r.world.health.get(r.caster)!.hp;
    expect(r.cast("R", r.target(), 45)).toBe("ok"); expect(r.count()).toBe(3);
    expect(r.world.health.get(r.caster)!.hp).toBeLessThan(hp); expect(r.status("curse")).toBe(true);
    expect(r.output()).toBeCloseTo(-.15);
    const victimHp = r.world.health.get(r.enemy)!.hp;
    expect(r.cast("EX", r.target(), 2)).toBe("ok"); expect(r.count()).toBe(0);
    expect(r.status("curse")).toBe(false); expect(r.status("boon")).toBe(true); expect(r.output()).toBeCloseTo(.1);
    expect(r.world.health.get(r.enemy)!.hp).toBe(victimHp); expect(r.hits("EX")).toHaveLength(0);
    expect(JSON.stringify(r.events)).toContain("怎麼反而變強了");
    r.step(61); expect(r.output()).toBe(0);
  });
  it.each(["basic", "ability:fixed", "dot:fixed"])("the curse and reversal change actual fixed %s damage, not just AD/AP", origin => {
    const r = setup(); r.place(r.ally, -8, 8); const ad = r.world.stats.get(r.enemy)!.final[Stat.AttackDamage];
    const base = r.hit(r.enemy, r.ally, 100, origin, "true");
    r.cast("R", r.target(), 45); expect(r.status("curse")).toBe(true);
    const cursed = r.hit(r.enemy, r.ally, 100, origin, "true"); expect(cursed / base).toBeCloseTo(.85, 5);
    r.seed(); r.cast("EX", r.target(), 1);
    const boosted = r.hit(r.enemy, r.ally, 100, origin, "true"); expect(boosted / base).toBeCloseTo(1.1, 5);
    expect(r.world.stats.get(r.enemy)!.final[Stat.AttackDamage]).toBe(ad);
    r.step(61); expect(r.hit(r.enemy, r.ally, 100, origin, "true") / base).toBeCloseTo(1, 5);
  });
  it.each(["clean", "expired", "cleansed"])("%s target gets ordinary EX damage and a shorter stronger output curse", mode => {
    const r = setup();
    if (mode !== "clean") r.cast("R", r.target(), 45);
    if (mode === "expired") r.step(130);
    if (mode === "cleansed") clearPools(r.world, r.enemy, { pools: { buffs: true }, polarity: "debuff", requireDispellable: true });
    r.seed(); r.cast("EX", r.target(), 1); expect(r.hits("EX")).toHaveLength(1); expect(r.output()).toBeCloseTo(-.2);
    expect(r.status("boon")).toBe(false); r.step(61); expect(r.output()).toBe(0);
  });
  it("another caster's R cannot be consumed and simultaneous sources remain independent", () => {
    const r = setup(); r.place(r.ally, 0, 2);
    r.cast("R", r.target(), 0, r.ally); r.step(45); r.seed(); r.cast("EX", r.target(), 1);
    expect(r.status("curse", r.enemy, r.ally)).toBe(true); expect(r.status("boon")).toBe(false); expect(r.hits("EX")).toHaveLength(1);
    r.ready("EX"); r.seed(); r.cast("R", r.target(), 45); r.cast("EX", r.target(), 1);
    expect(r.status("curse", r.enemy, r.ally)).toBe(true); expect(r.status("curse")).toBe(false); expect(r.status("boon")).toBe(true);
  });
  it("two Azazels can each reverse their own R in one tick without deleting another source", () => {
    const r = setup(); r.place(r.ally, 0, 2); r.cast("R", r.target()); r.cast("R", r.target(), 0, r.ally); r.step(45);
    r.seed(); r.seed(r.ally); const hp = r.world.health.get(r.enemy)!.hp;
    r.cast("EX", r.target()); expect(r.status("curse", r.enemy, r.ally)).toBe(true);
    r.cast("EX", r.target(), 1, r.ally); expect(r.status("curse", r.enemy, r.ally)).toBe(false);
    expect(r.status("boon")).toBe(true); expect(r.status("boon", r.enemy, r.ally)).toBe(true);
    expect(r.count()).toBe(0); expect(r.count(r.ally)).toBe(0); expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
  });
  it("control immunity does not delete the same-source reversal or turn it into damage", () => {
    const r = setup(); r.cast("R", r.target(), 45);
    r.effects([{ kind: "invulnerable", durationSec: 3, blocksDamage: "none", blocksControl: true }], r.enemy);
    r.seed(); const hp = r.world.health.get(r.enemy)!.hp; r.cast("EX", r.target(), 1);
    expect(r.status("boon")).toBe(true); expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
  });
  it.each([0, 1, 2])("EX refuses %s energy without spending mana, cooldown, stacks", count => {
    const r = setup(); if (count) r.seed(r.caster, count); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", r.target())).toBe("no-resource"); expect(r.count()).toBe(count);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
    expect(r.hits("EX")).toHaveLength(0);
  });
  it("one multi-target rain cast earns one energy total, a new cast can earn another, and the round resets", () => {
    const r = setup(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 2, 1);
    r.cast("W", r.point(), 40); expect(r.hits("W")).toHaveLength(6); expect(r.count()).toBe(1);
    for (let i = 0; i < 3; i++) { r.ready("W"); r.cast("W", r.point(), 40); }
    expect(r.count()).toBe(3); r.world.round++; resetMarksForRound(r.world); expect(r.count()).toBe(0);
  });
  it.each(["self", "hook", "zero", "immune", "shield"])("%s contact cannot manufacture a paid cast's HP-damage credit", mode => {
    const r = setup();
    if (mode === "self" || mode === "hook" || mode === "zero") r.hit(r.caster, mode === "self" ? r.caster : r.enemy, mode === "zero" ? 0 : 100, mode === "hook" ? "hook:test" : `ability:${r.project.projectId}.q`);
    if (mode === "immune") { r.effects([{ kind: "invulnerable", durationSec: 3 }], r.enemy); r.cast("Q", r.target(), 12); }
    if (mode === "shield") { r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy); r.cast("Q", r.target(), 12); }
    expect(r.count()).toBe(0);
  });
  it.each([1, 4])("Q has its windup, a single close punch and finite knockback at rank %s", rank => {
    const r = setup(rank); const x = r.world.transform.get(r.enemy)!.pos.x;
    r.cast("Q", r.target(), 3); expect(r.hits("Q")).toHaveLength(0); r.step(15);
    expect(r.hits("Q")).toHaveLength(1); expect(r.world.transform.get(r.enemy)!.pos.x - x).toBeCloseTo(.4, 3);
  });
  it("rain checks new arrivals at each wave and cannot follow departed targets", () => {
    const r = setup(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    r.cast("W", r.point(), 8); expect(r.hits("W").map(e => e.data.target)).toEqual([r.enemy]);
    r.place(r.enemy, 10); r.place(r.distant, 1.8); r.step(35);
    expect(r.hits("W").map(e => e.data.target)).toEqual([r.enemy, r.distant, r.distant]); expect(r.count()).toBe(1);
  });
  it.each(["death", "settled"])("%s ends pending rain waves", mode => {
    const r = setup(); r.cast("W", r.point(), 8); const n = r.hits("W").length;
    if (mode === "death") r.world.health.get(r.caster)!.alive = false; else r.world.settledZones.add(0);
    r.step(40); expect(r.hits("W")).toHaveLength(n);
  });
  it.each(["basic", "ability:close"])("one real close %s hit triggers E after damage, without granting immunity or energy", origin => {
    const r = setup(); r.cast("E", { type: "self" }); const before = r.world.health.get(r.caster)!.hp;
    r.hit(r.enemy, r.caster, 100, origin); expect(r.world.health.get(r.caster)!.hp).toBeLessThan(before);
    expect(r.counter()).toHaveLength(1); expect(r.status("counter", r.caster)).toBe(false); expect(r.count()).toBe(0);
    r.hit(r.enemy, r.caster, 100, origin); expect(r.counter()).toHaveLength(1);
  });
  it("the shadow punch uses normal damage multipliers and is not a reflected packet", () => {
    const measure = (scale: number) => {
      const r = setup(); r.world.combatEnv = { ...r.world.combatEnv, damageDealt: scale };
      r.cast("E", { type: "self" }); r.hit(); expect(r.counter()).toHaveLength(1);
      expect(r.events.some(e => e.type === "reflectSuccess")).toBe(false);
      return Number(r.counter()[0]!.data.amount);
    };
    expect(measure(2) / measure(1)).toBeCloseTo(2, 5);
  });
  it("a shield-absorbed hit still triggers E but the counter cannot consume the other hero's window", () => {
    const r = setup(); r.cast("E", { type: "self" }); r.cast("E", { type: "self" }, 0, r.enemy);
    r.effects([{ kind: "shield", amount: { flat: 1000 }, duration: 2 }]);
    expect(r.hit()).toBe(0); expect(r.counter()).toHaveLength(1); expect(r.status("counter", r.enemy, r.enemy)).toBe(true);
    expect(r.count()).toBe(0); expect(r.count(r.enemy)).toBe(0); expect(r.world.damageQueue).toHaveLength(0);
  });
  it.each(["zero", "immune", "far", "other-zone", "friendly", "hook", "expired"])("%s cannot spend E's one-hit window", mode => {
    const r = setup(); r.cast("E", { type: "self" });
    if (mode === "immune") r.effects([{ kind: "invulnerable", durationSec: 2 }]);
    if (mode === "far") r.place(r.enemy, 8);
    if (mode === "other-zone") r.world.transform.get(r.enemy)!.zone = 1;
    if (mode === "friendly") r.world.team.get(r.enemy)!.teamId = r.world.team.get(r.caster)!.teamId;
    if (mode === "expired") r.step(17);
    r.hit(r.enemy, r.caster, mode === "zero" ? 0 : 100, mode === "hook" ? "hook:reflection" : "basic");
    expect(r.counter()).toHaveLength(0); if (mode !== "expired") expect(r.status("counter", r.caster)).toBe(true);
  });
  it("E has no unrequested front-only condition", () => {
    const r = setup(); r.place(r.enemy, -1.8); r.cast("E", { type: "self" }); r.hit(); expect(r.counter()).toHaveLength(1);
  });
  it("R charges before payment, interruption cancels the launch, and the life cost is nonlethal", () => {
    const r = setup(); const hp = r.world.health.get(r.caster)!.hp; r.cast("R", r.target(), 10);
    expect(r.world.health.get(r.caster)!.hp).toBe(hp); expect(r.hits("R")).toHaveLength(0);
    r.effects([{ kind: "applyStatus", statusId: "test.stun" as StatusId, stun: true, duration: 1 }]); r.step(35);
    expect(r.world.health.get(r.caster)!.hp).toBe(hp); expect(r.status("curse")).toBe(false); expect(r.count()).toBe(0);
    r.ready("R"); r.world.health.get(r.caster)!.hp = 1; r.cast("R", r.target(), 45);
    expect(r.world.health.get(r.caster)!.hp).toBe(1); expect(r.count()).toBe(1);
  });
});
