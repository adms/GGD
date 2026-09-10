import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Projectiles } from "../../../sim/content/registry";
import { runEffects } from "../../../sim/effects/effectRunner";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { zEffectDef } from "../../schema/effect";
import type { EffectDef } from "../../../sim/effects/effect";
import type { ProjectileDef } from "../../../sim/content/defs";
import type { ProjectileId, StatusId } from "../../../ids";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("03", rank);
  const projectile = "imported.wave.fire" as ProjectileId;
  Projectiles.register(projectile, r.source.catalog.documents.get(`projectiles/${projectile}`) as unknown as ProjectileDef);
  const dir = { type: "dir" as const, dir: { x: 1, z: 0 } };
  const status = (name: string, target = r.caster, caster = r.caster) => consumableStatusStacks(r.world, target, `${r.project.projectId}.${name}` as StatusId, caster);
  const effects = (effects: EffectDef[], target = r.caster, caster = r.caster) => runEffects(effects, { world: r.world, caster, targets: [target], rank, origin: "fixture", rng: r.world.rng });
  const hit = (source = r.caster, target = r.enemy, amount = 100, origin = "basic") => {
    const hp = r.world.health.get(target)!; const before = hp.hp;
    r.world.damageQueue.push({ source, target, amount, type: "physical", crit: false, origin }); r.step(); return before - hp.hp;
  };
  const wall = (x: number) => r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map((z, i) => i ? z : {
    ...z, obstacles: [...z.obstacles, { kind: "segment" as const, a: { x: r.origin.x + x, z: r.origin.z - 5 }, b: { x: r.origin.x + x, z: r.origin.z + 5 } }],
  }) });
  const proc = (name: string) => r.events.filter(e => e.type === "damage" && String(e.data.origin).includes(name));
  return { ...r, dir, status, effects, hit, wall, proc };
}
describe("Mai six-slot source requirements", () => {
  it("has no ordinary on-attack bonus until a displacement actually completes", () => {
    const r = setup(); const ordinary = r.hit(); expect(r.hit()).toBeCloseTo(ordinary);
    r.place(r.enemy, 12); expect(r.cast("E", r.dir, 5)).toBe("ok"); expect(r.status("nimble")).toBe(0);
    r.step(22); expect(r.status("nimble")).toBe(1); r.place(r.enemy, 6.8);
    expect(r.hit()).toBeGreaterThan(ordinary); expect(r.status("nimble")).toBe(0); expect(r.hit()).toBeCloseTo(ordinary);
  });
  it("E then R refresh one shared charge, never two, and it expires in three seconds", () => {
    const r = setup(); r.place(r.enemy, 15); r.cast("E", r.dir, 24); expect(r.status("nimble")).toBe(1);
    r.cast("R", { type: "dir", dir: { x: -1, z: 0 } }, 45); expect(r.status("nimble")).toBe(1);
    r.step(95); expect(r.status("nimble")).toBe(0);
  });
  it.each(["skill", "zero", "immune", "friendly"] as const)("%s contact does not consume the next basic-hit charge", mode => {
    const r = setup(); r.place(r.enemy, 12); r.cast("E", r.dir, 24);
    if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 1 }], r.enemy);
    r.hit(r.caster, mode === "friendly" ? r.ally : r.enemy, mode === "zero" ? 0 : 100, mode === "skill" ? "ability:fixture.q" : "basic");
    expect(r.status("nimble")).toBe(1);
  });
  it("a shield-absorbed basic attack consumes the charge and another caster cannot borrow it", () => {
    const r = setup(); r.place(r.enemy, 12); r.cast("E", r.dir, 24);
    r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy);
    r.hit(r.ally); expect(r.status("nimble")).toBe(1); r.hit(); expect(r.status("nimble")).toBe(0);
    expect(r.world.health.get(r.enemy)!.shields[0]!.amount).toBeLessThan(9800);
  });
  it.each([1, 4])("Q is one piercing projectile with one collision per enemy at rank %s", rank => {
    const r = setup(rank); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 6);
    r.cast("Q", r.dir, 40); expect(r.events.filter(e => e.type === "projectileSpawn")).toHaveLength(1);
    expect(r.hits("Q").map(e => e.data.target).sort()).toEqual([r.enemy, r.distant].sort());
    expect(r.world.projectile.size).toBe(0);
  });
  it("Q follows GGD skill-through-wall rules without moving its caster", () => {
    const r = setup(); r.place(r.enemy, 4); r.wall(2); r.cast("Q", r.dir, 40);
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]); expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x);
  });
  it("Q ignores friendly, dead, off-path and cross-duel bodies", () => {
    for (const mode of ["friendly", "dead", "side", "zone"] as const) {
      const r = setup(); if (mode === "friendly") r.world.team.get(r.enemy)!.teamId = r.world.team.get(r.caster)!.teamId;
      if (mode === "dead") r.world.health.get(r.enemy)!.alive = false;
      if (mode === "side") r.place(r.enemy, 3, 4);
      if (mode === "zone") r.world.transform.get(r.enemy)!.zone++;
      r.cast("Q", r.dir, 40); expect(r.hits("Q")).toHaveLength(0);
    }
  });
  it("W hits a front arc once and excludes the rear and distant bodies", () => {
    const r = setup(); r.place(r.enemy, 1.5, 1); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, -1.5);
    r.cast("W", r.dir, 12); expect(r.hits("W").map(e => e.data.target)).toEqual([r.enemy]);
    r.ready("W"); r.place(r.enemy, 5); r.cast("W", r.dir, 12); expect(r.hits("W")).toHaveLength(1);
  });
  it("E touches each swept enemy once and continues to its endpoint", () => {
    const r = setup(); r.place(r.enemy, 1.5); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 3.7);
    r.cast("E", r.dir, 25); expect(r.hits("E").map(e => e.data.target)).toEqual([r.enemy, r.distant]);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeGreaterThan(4.5); expect(r.status("nimble")).toBe(1);
    r.step(10); expect(r.hits("E")).toHaveLength(2);
  });
  it("E stops before the wall and cannot touch an enemy behind it", () => {
    const r = setup(); r.place(r.enemy, 4); r.wall(2); r.cast("E", r.dir, 30);
    expect(r.hits("E")).toHaveLength(0); expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(2);
    expect(r.status("nimble")).toBe(1); expect(r.world.dashOnEnd).toHaveLength(0);
  });
  it.each(["dead", "settled", "replacement"] as const)("%s cancels E callbacks without granting completion", mode => {
    const r = setup(); r.place(r.enemy, 4); r.cast("E", r.dir, 5); expect(r.status("nimble")).toBe(0);
    if (mode === "dead") r.world.health.get(r.caster)!.alive = false;
    if (mode === "settled") r.world.settledZones.add(0);
    if (mode === "replacement") r.effects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 1 }]);
    r.step(30); expect(r.status("nimble")).toBe(0); expect(r.hits("E")).toHaveLength(0); expect(r.world.dashOnEnd).toHaveLength(0);
    if (mode === "dead") expect(r.world.nav.get(r.caster)!.override).toBeNull();
  });
  it("a zero direction cannot attach touch or completion to another live dash", () => {
    const r = setup(); r.place(r.enemy, 4); r.effects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 5 }]);
    const previous = r.world.nav.get(r.caster)!.override;
    runEffects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 3, onTouch: [{ kind: "damage", amount: { flat: 100 } }] }], {
      world: r.world, caster: r.caster, targets: [], rank: 1, direction: { x: 0, z: 0 }, origin: "fixture-zero", rng: r.world.rng });
    expect(r.world.nav.get(r.caster)!.override).toBe(previous); expect(r.world.dashOnEnd).toHaveLength(0);
    expect(previous).not.toHaveProperty("touchScope");
  });
  it.each([1, 4])("R has a visible windup, first contact, three followups and one small finisher at rank %s", rank => {
    const r = setup(rank); r.place(r.enemy, 3); r.cast("R", r.dir, 12);
    expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x); expect(r.hits("R")).toHaveLength(0);
    r.step(38); expect(r.hits("R")).toHaveLength(1); expect(r.proc("r-followup")).toHaveLength(4);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(3); expect(r.status("nimble")).toBe(1);
  });
  it.each(["empty", "wall", "immune", "windup-interrupt"] as const)("R %s cannot start a successful-contact combo", mode => {
    const r = setup(); r.place(r.enemy, mode === "empty" ? 15 : 3);
    if (mode === "wall") r.wall(2);
    if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 3 }], r.enemy);
    r.cast("R", r.dir, 5);
    if (mode === "windup-interrupt") r.effects([{ kind: "applyStatus", statusId: "stun" as StatusId, stun: true, duration: 1 }]);
    r.step(55); expect(r.proc("r-followup")).toHaveLength(0);
  });
  it("R shield contact starts the combo, but leaving melee range stops subsequent hits", () => {
    const r = setup(); r.place(r.enemy, 3); r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 5 }], r.enemy);
    r.cast("R", r.dir, 27); expect(r.hits("R")).toHaveLength(1); r.place(r.enemy, 12); r.step(25);
    expect(r.proc("r-followup")).toHaveLength(0);
  });
  it("R finisher can hit a nearby second enemy once without starting another combo", () => {
    const r = setup(); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 3, 1.6);
    r.cast("R", r.dir, 50); expect(r.proc("r-followup").filter(e => e.data.target === r.distant)).toHaveLength(1);
    expect(r.proc("r-followup")).toHaveLength(5);
  });
  it("EX follows actual casts at most once per cast and three times total, without recursion", () => {
    const r = setup(); r.cast("EX", { type: "self" }, 1);
    for (let n = 0; n < 4; n++) { r.ready("W"); r.cast("W", r.dir, 12); }
    expect(r.hits("W")).toHaveLength(4); expect(r.proc("afterimage")).toHaveLength(3); expect(r.status("afterimage")).toBe(0);
    r.step(30); expect(r.proc("afterimage")).toHaveLength(3);
  });
  it("one piercing Q across several targets consumes one afterimage trigger", () => {
    const r = setup(); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 6);
    r.cast("EX", { type: "self" }, 1); r.cast("Q", r.dir, 35);
    expect(r.hits("Q")).toHaveLength(2); expect(r.proc("afterimage").map(e => e.data.target)).toEqual([r.enemy]);
  });
  it("EX admits real shield absorption but not ordinary attacks or raw uncredited packets", () => {
    const r = setup(); r.cast("EX", { type: "self" }, 1); r.hit(); r.hit(r.caster, r.enemy, 100, `ability:${r.project.projectId}.w`);
    expect(r.proc("afterimage")).toHaveLength(0);
    r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy); r.cast("W", r.dir, 12);
    expect(r.proc("afterimage")).toHaveLength(1);
  });
  it("EX expires and does not follow another caster or select an unrelated target", () => {
    const r = setup(); r.cast("EX", { type: "self" }, 1); r.place(r.ally, 0, 1);
    r.cast("W", r.dir, 12, r.ally); expect(r.proc("afterimage")).toHaveLength(0);
    r.step(95); r.cast("W", r.dir, 12); expect(r.proc("afterimage")).toHaveLength(0);
  });
  it("authored dash refuses contradictory or inert touch options", () => {
    const dash = { kind: "dash", mode: "forward", speed: 8, maxDistance: 3 };
    expect(zEffectDef.safeParse({ ...dash, touchScope: "enemy" }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...dash, stopOnHit: "enemy", onTouch: [{ kind: "damage", amount: { flat: 1 } }] }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...dash, onEndOn: "resolved", onEnd: [{ kind: "heal", amount: { flat: 1 } }] }).success).toBe(true);
  });
});
