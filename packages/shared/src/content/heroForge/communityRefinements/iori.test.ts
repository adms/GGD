import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { runEffects } from "../../../sim/effects/effectRunner";
import { restoreForNextRound } from "../../../sim/clearPools";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import type { EffectDef } from "../../../sim/effects/effect";
import type { StatusId } from "../../../ids";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("02", rank);
  const dir = { type: "dir" as const, dir: { x: 1, z: 0 } };
  const status = (name: string, target = r.enemy, caster = r.caster) => consumableStatusStacks(r.world, target, `${r.project.projectId}.${name}` as StatusId, caster);
  const effects = (effects: EffectDef[], target = r.caster, caster = r.caster) => runEffects(effects, { world: r.world, caster, targets: [target], rank, origin: "fixture", rng: r.world.rng });
  const hit = (source = r.enemy, target = r.caster, amount = 100) => {
    const hp = r.world.health.get(target)!.hp;
    r.world.damageQueue.push({ source, target, amount, type: "physical", crit: false, origin: "basic" }); r.step();
    return hp - r.world.health.get(target)!.hp;
  };
  const followups = () => r.events.filter(e => e.type === "damage" && String(e.data.origin).endsWith(".r-contact"));
  const firstR = () => { expect(r.cast("R", dir)).toBe("ok"); for (let i = 0; i < 40 && r.hits("R").length === 0; i++) r.step(); expect(r.hits("R")).toHaveLength(1); };
  const finishR = () => { firstR(); r.step(21); expect(status("r-complete")).toBe(1); };
  const wall = () => r.world.setArena({ ...r.world.arena, zones: r.world.arena.zones.map((z, i) => i ? z : {
    ...z, obstacles: [...z.obstacles, { kind: "segment" as const, a: { x: r.origin.x + 2, z: r.origin.z - 5 }, b: { x: r.origin.x + 2, z: r.origin.z + 5 } }],
  }) });
  return { ...r, dir, status, effects, hit, followups, firstR, finishR, wall };
}

describe("Iori full original mechanism chain", () => {
  it.each([1, 4])("alternating real skills build capped target flames at rank %i; same skill and recasts do not", rank => {
    const r = setup(rank);
    for (const [slot, n] of [["Q", 1], ["Q", 1], ["E", 2], ["E", 2], ["Q", 3], ["E", 3]] as const) {
      r.ready(slot); expect(r.cast(slot, r.dir, 8)).toBe("ok"); expect(r.status("violet-flame")).toBe(n);
    }
    r.step(122); expect(r.status("violet-flame")).toBe(0);
    r.ready("Q"); r.cast("Q", r.dir, 8); expect(r.status("violet-flame")).toBe(1);
    restoreForNextRound(r.world, r.enemy); expect(r.status("violet-flame")).toBe(0);
  });
  it("target history and exclusive skill markers remain isolated between two casters", () => {
    const r = setup(); r.cast("Q", r.dir, 8); expect(r.status("violet-flame")).toBe(1);
    r.place(r.ally, 0, .9); r.place(r.enemy, 1.8, .9);
    r.cast("E", r.dir, 7, r.ally); expect(r.status("violet-flame", r.enemy, r.ally)).toBe(1);
    expect(r.status("last-q")).toBe(1); expect(r.status("last-e", r.enemy, r.ally)).toBe(1);
    r.ready("Q"); r.place(r.caster, 0, .9); r.cast("Q", r.dir, 8); expect(r.status("violet-flame")).toBe(1);
    r.cast("E", r.dir, 7); expect(r.status("violet-flame")).toBe(2); expect(r.status("last-e", r.enemy, r.ally)).toBe(1);
    r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    r.place(r.enemy, 10, 4); r.place(r.distant, 1.8, .9); r.ready("Q"); r.cast("Q", r.dir, 8);
    expect(r.status("violet-flame", r.distant)).toBe(1); expect(r.status("violet-flame")).toBe(2);
  });
  it.each(["basic", "miss", "immune", "friendly", "cross-zone"] as const)("%s cannot earn violet flame", mode => {
    const r = setup();
    if (mode === "basic") r.hit(r.caster, r.enemy);
    else {
      if (mode === "miss") r.place(r.enemy, 4, 4);
      if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 2 }], r.enemy);
      if (mode === "friendly") r.world.team.get(r.enemy)!.teamId = r.world.team.get(r.caster)!.teamId;
      if (mode === "cross-zone") r.world.transform.get(r.enemy)!.zone++;
      r.cast("Q", r.dir, 30);
    }
    expect(r.status("violet-flame")).toBe(0);
  });
  it("shield absorption is a valid skill hit but Q stops at the first enemy", () => {
    const r = setup(); r.place(r.enemy, 3); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 6);
    r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 2 }], r.enemy);
    const hp = r.world.health.get(r.enemy)!.hp; r.cast("Q", r.dir, 35);
    expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]); expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
    expect(r.status("violet-flame")).toBe(1); expect(r.status("violet-flame", r.distant)).toBe(0);
    expect(r.events.filter(e => e.type === "projectileSpawn")).toHaveLength(1); expect(r.world.projectile.size).toBe(0);
  });
  it("Q can pass GGD terrain without turning into a traveling area wave", () => {
    const r = setup(); r.wall(); r.place(r.enemy, 4); r.cast("Q", r.dir, 30);
    expect(r.hits("Q")).toHaveLength(1); expect(r.world.transform.get(r.caster)!.pos.x).toBe(r.origin.x);
  });
  it("W stays at its origin, strikes nearby enemies once and gives one bounded counter", () => {
    const r = setup(); const at = { ...r.world.transform.get(r.caster)!.pos };
    r.cast("W", { type: "entity", entityId: r.caster }, 4);
    expect(r.world.transform.get(r.caster)!.pos).toEqual(at); expect(r.hits("W")).toHaveLength(1);
    expect(r.world.transform.get(r.enemy)!.pos.x).toBeGreaterThan(r.origin.x + 1.8);
    expect(r.status("counter-window", r.caster)).toBe(1);
    expect(r.hit()).toBe(0); expect(r.status("counter-window", r.caster)).toBe(0); expect(r.hit()).toBeGreaterThan(0);
    r.ready("W"); r.place(r.enemy, 10); r.cast("W", { type: "entity", entityId: r.caster }, 15);
    expect(r.hits("W")).toHaveLength(1); expect(r.status("counter-window", r.caster)).toBe(0); expect(r.hit()).toBeGreaterThan(0);
  });
  it.each([1, 4])("rank %i R contact starts one finite chain, burns three flames and grants only its target window", rank => {
    const r = setup(rank); r.cast("Q", r.dir, 8); r.cast("E", r.dir, 8); expect(r.status("violet-flame")).toBe(2);
    r.firstR(); expect(r.status("violet-flame")).toBe(3); expect(r.status("r-complete")).toBe(0);
    r.step(21); expect(r.followups()).toHaveLength(7); expect(new Set(r.followups().map(e => e.tick)).size).toBe(4);
    expect(r.status("violet-flame")).toBe(0); expect(r.status("r-complete")).toBe(1);
    expect(r.status("r-complete", r.distant)).toBe(0); expect(r.status("r-complete", r.enemy, r.ally)).toBe(0);
    r.step(45); expect(r.followups()).toHaveLength(7); expect(r.status("r-complete")).toBe(0);
  });
  it.each(["wall", "miss", "immune"] as const)("R %s never starts a combo or opens EX", mode => {
    const r = setup(); if (mode === "wall") { r.wall(); r.place(r.enemy, 4); }
    if (mode === "miss") r.place(r.enemy, 12, 4);
    if (mode === "immune") r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 3 }], r.enemy);
    r.cast("R", r.dir, 65); expect(r.followups()).toHaveLength(0); expect(r.status("r-complete")).toBe(0);
  });
  it.each(["far", "victim-dead", "caster-dead", "settled", "other-zone"] as const)("R %s cancels its remaining chain permanently", mode => {
    const r = setup(); r.firstR(); r.step(5); expect(r.followups()).toHaveLength(1);
    if (mode === "far") r.place(r.enemy, 10);
    if (mode === "victim-dead") r.world.health.get(r.enemy)!.alive = false;
    if (mode === "caster-dead") r.world.health.get(r.caster)!.alive = false;
    if (mode === "settled") r.world.settledZones.add(0);
    if (mode === "other-zone") r.world.transform.get(r.enemy)!.zone++;
    r.step(8); if (mode === "far") r.place(r.enemy, 1.8); r.step(30);
    expect(r.followups()).toHaveLength(1); expect(r.status("r-complete")).toBe(0);
  });
  it("EX is standalone before R completion and leaves R cooldown intact", () => {
    const r = setup(); const inst = abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!;
    r.cast("EX", { type: "entity", entityId: r.enemy }); const cd = inst.cooldownRemainingTicks;
    expect(cd).toBeGreaterThan(0); r.step(16); expect(r.hits("EX")).toHaveLength(4); // three strikes + one owned flame
    expect(inst.cooldownRemainingTicks).toBe(cd - 16); expect(r.world.abilities.get(r.caster)!.slots.R.cooldownRemainingTicks).toBe(0);
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("cooldown");
  });
  it("R completion consumes its own target window exactly once for four EX strikes", () => {
    const r = setup(); r.finishR(); const rcd = r.world.abilities.get(r.caster)!.slots.R.cooldownRemainingTicks;
    const ex = abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!; const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("ok"); const after = r.world.health.get(r.caster)!.mana, cd = ex.cooldownRemainingTicks;
    expect(after).toBeLessThan(mana); expect(r.status("r-complete")).toBe(0);
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("cooldown"); expect(r.world.health.get(r.caster)!.mana).toBe(after);
    r.step(21); expect(r.hits("EX")).toHaveLength(5); // four strikes + one flame
    expect(ex.cooldownRemainingTicks).toBe(cd - 21); expect(r.world.abilities.get(r.caster)!.slots.R.cooldownRemainingTicks).toBe(rcd - 21);
    expect(r.status("violet-flame")).toBe(0);
  });
  it.each(["expired", "other-caster", "other-target"] as const)("EX %s completion does not borrow a followup", mode => {
    const r = setup(); r.finishR(); let caster = r.caster, target = r.enemy;
    if (mode === "expired") r.step(37);
    if (mode === "other-caster") { caster = r.ally; r.place(caster, 0, 1); }
    if (mode === "other-target") { target = r.distant; r.world.team.get(target)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(target, 1.8, 1); }
    expect(r.cast("EX", { type: "entity", entityId: target }, 20, caster)).toBe("ok");
    expect(r.hits("EX")).toHaveLength(4); if (mode !== "expired") expect(r.status("r-complete")).toBe(1);
  });
  it("bad EX target and insufficient mana preserve costs and the completion window", () => {
    const r = setup(); r.finishR(); const ex = abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!;
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.ally })).not.toBe("ok");
    r.place(r.enemy, 10); expect(r.cast("EX", { type: "entity", entityId: r.enemy })).not.toBe("ok");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana); expect(ex.cooldownRemainingTicks).toBe(0); expect(r.status("r-complete")).toBe(1);
    r.place(r.enemy, 1.8); r.world.health.get(r.caster)!.mana = 0;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("no-mana"); expect(r.status("r-complete")).toBe(1); expect(ex.cooldownRemainingTicks).toBe(0);
  });
});

it("R shield-only contact still completes exactly one finite combo", () => {
  const r = setup(); r.effects([{ kind: "shield", amount: { flat: 10000 }, duration: 3 }], r.enemy);
  const hp = r.world.health.get(r.enemy)!.hp; r.finishR();
  expect(r.hits("R")).toHaveLength(1); expect(r.followups()).toHaveLength(5);
  expect(r.world.health.get(r.enemy)!.hp).toBe(hp); expect(r.status("violet-flame")).toBe(0);
});
it("an EX pressed during R's unfinished chain remains the independent three-strike version", () => {
  const r = setup(); r.firstR(); expect(r.status("r-complete")).toBe(0);
  expect(r.cast("EX", { type: "entity", entityId: r.enemy }, 21)).toBe("ok");
  expect(new Set(r.hits("EX").map(e => e.tick)).size).toBe(3);
  expect(r.status("r-complete")).toBe(1);
});
