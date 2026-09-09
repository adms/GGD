import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runEffects } from "../../../sim/effects/effectRunner";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { approachesOf } from "../../../sim/content/castApproachState";
import { dashContact } from "../../../sim/movement/dashContact";
import { zEffectDef } from "../../schema/effect";
import { zHookDef } from "../../schema/effects/_hook";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("28", rank);
  const mark = (name: string, target = r.enemy, caster = r.caster) => consumableStatusStacks(r.world, target, `${r.project.projectId}.${name}` as StatusId, caster);
  const hit = (source = r.caster, target = r.enemy, amount = 100, origin = "basic") => {
    const hp = r.world.health.get(target)!; const before = hp.hp;
    r.world.damageQueue.push({ source, target, amount, type: "physical", crit: false, origin }); r.step();
    return before - hp.hp;
  };
  const effects = (effects: EffectDef[], target = r.caster, caster = r.caster) => runEffects(effects, { world: r.world, caster,
    targets: [target], rank, origin: "test:fixture", rng: r.world.rng });
  const dir = { type: "dir" as const, dir: { x: 1, z: 0 } };
  const wall = (x: number) => r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map((z, i) => i ? z : {
    ...z, obstacles: [...z.obstacles, { kind: "segment" as const, a: { x: r.origin.x + x, z: r.origin.z - 5 }, b: { x: r.origin.x + x, z: r.origin.z + 5 } }],
  }) });
  return { ...r, mark, hit, effects, dir, wall };
}
describe("Eris original six-slot combat requirements", () => {
  it("first melee contact has one finite bonus per enemy and ongoing combat cannot refresh it", () => {
    const r = setup(); const first = r.hit(); const second = r.hit();
    expect(first).toBeGreaterThan(second); expect(r.mark("opener-lock")).toBe(1); expect(r.mark("opening")).toBe(0);
    for (let i = 0; i < 9; i++) { r.step(30); expect(r.hit()).toBeCloseTo(second); }
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 1.8, 2);
    expect(r.hit(r.caster, r.distant)).toBeGreaterThan(second);
    r.step(125); expect(r.hit()).toBeGreaterThan(second);
  });
  it("a newly attacking enemy opens two seconds, but a late melee response is ordinary", () => {
    const r = setup(); r.hit(r.enemy, r.caster); expect(r.mark("opening")).toBe(1);
    r.step(65); const late = r.hit(); expect(r.mark("opener-lock")).toBe(0);
    r.step(125); expect(r.hit()).toBeGreaterThan(late);
  });
  it("far contact cannot spend a melee opener and different players keep their own counters", () => {
    const r = setup(); r.place(r.enemy, 6); r.hit(); expect(r.mark("opener-lock")).toBe(0);
    r.place(r.enemy, 1.8); const first = r.hit(); expect(r.mark("opener-lock")).toBe(1);
    r.place(r.ally, 0, 1); expect(r.hit(r.ally)).toBeCloseTo(first); expect(r.mark("opener-lock", r.enemy, r.ally)).toBe(1);
  });
  it.each(["zero", "immune", "proc"] as const)("%s contact does not manufacture an opener or pursuit", mode => {
    const r = setup(); if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 1 }], r.enemy);
    r.hit(r.caster, r.enemy, mode === "zero" ? 0 : 100, mode === "proc" ? "proc:test" : "basic");
    expect(r.mark("opening")).toBe(0); expect(r.mark("combat")).toBe(0); expect(r.mark("recent-hit")).toBe(0);
  });
  it("a real shield-absorbed hit can open combat and pursuit", () => {
    const r = setup(); r.effects([{ kind: "shield", amount: { flat: 1000 }, duration: 2 }], r.enemy);
    expect(r.hit()).toBe(0); expect(r.mark("opener-lock")).toBe(1); expect(r.mark("recent-hit")).toBe(1);
  });
  it("Q steps first, then strikes a front arc once; rear and distant enemies are excluded", () => {
    const r = setup(); r.place(r.enemy, 2.6); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, -1.5);
    expect(r.cast("Q", r.dir, 5)).toBe("ok"); expect(r.hits("Q")).toHaveLength(0);
    r.step(8); expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeCloseTo(1);
    expect(r.events.some(e => e.type === "leap")).toBe(false);
  });
  it("W raises finite resistance for three seconds and repeated casts do not stack", () => {
    const r = setup(); r.hit(r.enemy, r.caster); const ordinary = r.hit(r.enemy, r.caster);
    expect(r.cast("W", { type: "self" }, 1)).toBe("ok"); const guarded = r.hit(r.enemy, r.caster);
    expect(guarded).toBeLessThan(ordinary); r.step(30); r.ready("W"); r.cast("W", { type: "self" }, 1);
    expect(r.hit(r.enemy, r.caster)).toBeCloseTo(guarded);
    r.step(92); expect(r.hit(r.enemy, r.caster)).toBeCloseTo(ordinary);
  });
  it("E stops against an enemy with no damage or push", () => {
    const r = setup(); r.place(r.enemy, 2); const enemy = { ...r.world.transform.get(r.enemy)!.pos };
    expect(r.cast("E", r.dir, 15)).toBe("ok"); expect(r.hits("E")).toHaveLength(0);
    expect(r.world.transform.get(r.enemy)!.pos).toEqual(enemy);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(2);
    expect(r.world.nav.get(r.caster)!.override).toBeNull();
  });
  it.each([1, 4])("R waits for its windup and stops at the first enemy with one strike at rank %s", rank => {
    const r = setup(rank); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 6);
    expect(r.cast("R", r.dir, 12)).toBe("ok"); expect(r.hits("R")).toHaveLength(0);
    expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x);
    r.step(20); expect(r.hits("R").map(e => e.data.target)).toEqual([r.enemy]);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(3);
    expect(r.world.nav.get(r.caster)!.override).toBeNull(); r.step(20); expect(r.hits("R")).toHaveLength(1);
  });
  it("R cannot acquire or hit an enemy behind the wall", () => {
    const r = setup(); r.place(r.enemy, 3); r.wall(2);
    r.cast("R", r.dir, 40); expect(r.hits("R")).toHaveLength(0);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThan(2);
    expect(r.world.nav.get(r.caster)!.override).toBeNull();
  });
  it("R ignores allies, dead bodies and other duel zones", () => {
    const r = setup(); r.place(r.ally, 2); r.place(r.enemy, 4); r.world.health.get(r.enemy)!.alive = false;
    r.place(r.distant, 6); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.world.transform.get(r.distant)!.zone++;
    r.cast("R", r.dir, 18); const dash = r.world.nav.get(r.caster)!.override!;
    r.step(32); expect(r.hits("R")).toHaveLength(0);
    expect(dash.kind).toBe("dash"); if (dash.kind === "leap") throw new Error("Expected a ground dash");
    expect(dash.remaining).toBeCloseTo(0);
    expect("hitTarget" in dash).toBe(false);
    // The ordinary soft body separation still changes travelled distance.
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeLessThanOrEqual(8);
  });
  it("EX consumes its own recent-hit mark at acceptance and cannot borrow another player's", () => {
    const r = setup(); r.hit(r.ally); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("target-condition");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); r.hit();
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("ok"); expect(r.mark("recent-hit")).toBe(0);
    expect(r.mark("recent-hit", r.enemy, r.ally)).toBe(1); r.step(8); expect(r.hits("EX")).toHaveLength(1);
  });
  it("EX refuses range immediately without approach, payment or marker consumption", () => {
    const r = setup(); r.hit(); r.place(r.enemy, 6); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("out-of-range");
    expect(approachesOf(r.world).has(r.caster)).toBe(false); expect(r.mark("recent-hit")).toBe(1);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
  });
  it("EX rejects expired or invalid target marks", () => {
    const r = setup(); r.hit(); r.step(65);
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("target-condition");
    expect(r.cast("EX", { type: "entity", entityId: r.ally })).toBe("bad-target");
  });
  it("rejects unconsumable contact callbacks and unconnected event filters", () => {
    expect(zEffectDef.safeParse({ kind: "dash", mode: "forward", speed: 8, maxDistance: 3, onHit: [{ kind: "damage", amount: { flat: 1 } }] }).success).toBe(false);
    expect(zHookDef.safeParse({ on: "onInterval", damageConnected: true, effects: [] }).success).toBe(false);
    const beforeDamage = { on: "onDamageTaken", effects: [{ kind: "damage", amount: { flat: 0 }, incomingPct: { perRank: [1], basis: "mitigated", negateOriginal: true } }] };
    expect(zHookDef.safeParse(beforeDamage).success).toBe(true);
    expect(zHookDef.safeParse({ ...beforeDamage, damageConnected: true }).success).toBe(false);
  });
  it("empty R reaches its bounded endpoint without producing a hit", () => {
    const r = setup(); r.place(r.enemy, 15); r.cast("R", r.dir, 45);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeCloseTo(8);
    expect(r.hits("R")).toHaveLength(0); expect(r.world.dashOnEnd).toHaveLength(0);
  });
  it("an overlapping enemy behind the direction cannot catch or be hit by R", () => {
    const r = setup(); r.place(r.enemy, -0.5);
    r.cast("R", r.dir, 45); expect(r.hits("R")).toHaveLength(0);
    expect(r.world.transform.get(r.caster)!.pos.x - r.origin.x).toBeGreaterThan(6);
  });
  it("R can be interrupted during windup without starting displacement or damage", () => {
    const r = setup(); r.cast("R", r.dir, 5);
    r.effects([{ kind: "applyStatus", statusId: "test:stun" as StatusId, duration: 1, stun: true }]);
    r.step(40); expect(r.hits("R")).toHaveLength(0);
    expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x);
    expect(r.world.dashOnEnd).toHaveLength(0);
  });
  it("death during the dash cancels pending contact and cannot resume a hit after revival", () => {
    const r = setup(); r.place(r.enemy, 7); r.cast("R", r.dir, 18);
    expect(r.world.dashOnEnd).toHaveLength(1); r.world.health.get(r.caster)!.alive = false; r.step(2);
    expect(r.world.nav.get(r.caster)!.override).toBeNull(); expect(r.world.dashOnEnd).toHaveLength(0);
    r.world.health.get(r.caster)!.alive = true; r.step(40); expect(r.hits("R")).toHaveLength(0);
  });
  it("a replacement dash cannot inherit the canceled dash's on-hit damage", () => {
    const r = setup(); r.place(r.enemy, 7); r.cast("R", r.dir, 18);
    r.effects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 1 }]);
    r.step(40); expect(r.hits("R")).toHaveLength(0); expect(r.world.dashOnEnd).toHaveLength(0);
  });
  it("zero-direction input cannot attach a contact payload to an existing dash", () => {
    const r = setup(); r.place(r.enemy, 2);
    r.effects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 3 }]);
    const original = r.world.nav.get(r.caster)!.override;
    const displacements = r.world.events.filter(e => e.type === "displace").length;
    runEffects([{ kind: "dash", mode: "forward", speed: 8, maxDistance: 3, stopOnHit: "enemy",
      onHit: [{ kind: "damage", amount: { flat: 100 } }] }], { world: r.world, caster: r.caster,
      targets: [], direction: { x: 0, z: 0 }, rank: 1, origin: "test:zero-dash", rng: r.world.rng });
    expect(r.world.nav.get(r.caster)!.override).toBe(original);
    expect(original).not.toHaveProperty("stopOnHit"); expect(r.world.dashOnEnd).toHaveLength(0);
    expect(r.world.events.filter(e => e.type === "displace")).toHaveLength(displacements);
    r.step(30); expect(r.events.filter(e => e.type === "damage" && e.data.origin === "test:zero-dash")).toHaveLength(0);
  });
  it("contact ties are stable across entity iteration order and champion-only scope excludes other bodies", () => {
    const r = setup(); r.place(r.enemy, 3); r.place(r.distant, 3);
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    const to = { x: r.origin.x + 8, z: r.origin.z };
    const first = dashContact(r.world, r.caster, r.origin, to, "enemy");
    expect(first?.target).toBe(Math.min(r.enemy, r.distant));
    const entities = [...r.world.transform.entries()].reverse(); r.world.transform.clear();
    for (const [id, body] of entities) r.world.transform.set(id, body);
    expect(dashContact(r.world, r.caster, r.origin, to, "enemy")).toEqual(first);
    r.world.champion.delete(first!.target);
    expect(dashContact(r.world, r.caster, r.origin, to, "enemyChampion")?.target)
      .toBe(first!.target === r.enemy ? r.distant : r.enemy);
  });
});
