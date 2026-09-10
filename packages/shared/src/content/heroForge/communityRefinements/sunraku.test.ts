import { beforeAll, describe, expect, it } from "vitest";
import { communityActionFixture } from "../../../../testkit/communityActionFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runEffects } from "../../../sim/effects/effectRunner";
import { fireHooks } from "../../../sim/effects/hooks";
import { rollEvade, rollFumble } from "../../../sim/combat/evasion";
import { worldHookSystem } from "../../../sim/systems/WorldHookSystem";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { resetMarksForRound } from "../../../sim/marks";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { zAbilityDoc } from "../../schema/ability";
import { zHookDef } from "../../schema/effects/_hook";
import { approachesOf } from "../../../sim/content/castApproachState";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityActionFixture("31", rank);
  const sid = (name: string) => `${r.project.projectId}.${name}` as StatusId;
  const mark = (name: string, target = r.enemy, caster = r.caster) => consumableStatusStacks(r.world, target, sid(name), caster);
  const hit = (source = r.enemy, target = r.caster, type: "physical" | "magic" | "true" = "physical", amount = 100) => {
    r.world.damageQueue.push({ source, target, type, amount, origin: "basic", crit: false }); r.step();
  };
  const effects = (list: EffectDef[], target = r.caster, caster = r.caster) => runEffects(list, {
    world: r.world, caster, targets: [target], rank, origin: "test:fixture", rng: r.world.rng,
  });
  const dispatch = (action: () => unknown) => {
    r.world.events.length = 0; const result = action(); worldHookSystem(r.world);
    r.events.push(...r.world.events); r.world.events.length = 0; return result;
  };
  const dodge = () => dispatch(() => rollEvade(r.world, r.enemy, r.caster));
  const slide = (ticks = 1) => r.cast("W", { type: "dir", dir: { x: 0, z: 1 } }, ticks);
  const earnReads = () => {
    expect(slide()).toBe("ok");
    for (let i = 0; i < 40 && r.count("read") < 3; i++) dodge();
    expect(r.count("read")).toBe(3);
    r.step(30); r.place(r.caster, 0); r.place(r.enemy, 1.8);
  };
  return { ...r, sid, mark, hit, effects, dispatch, dodge, slide, earnReads };
}

describe("SUN樂 original six-slot combat requirements", () => {
  it("empty slide moves on the ground, has no damage, and grants no reads", () => {
    const r = setup(); const start = { ...r.world.transform.get(r.caster)!.pos };
    expect(r.count("read")).toBe(0); expect(r.slide(12)).toBe("ok");
    expect(r.world.transform.get(r.caster)!.pos.z - start.z).toBeCloseTo(2.4);
    expect(r.count("read")).toBe(0); expect(r.hits("W")).toHaveLength(0);
    expect(r.events.some(e => e.type === "leap")).toBe(false);
  });
  it("real source-attributed dodges during actual slide cap reads at three and reset per round", () => {
    const r = setup(); r.earnReads();
    expect(r.mark("engaged")).toBe(1); expect(r.count("read", r.ally)).toBe(0);
    resetMarksForRound(r.world); expect(r.count("read")).toBe(0);
  });
  it("starting a slide without a movement frame and late dodges do not earn reads", () => {
    const r = setup(); expect(r.slide(0)).toBe("ok"); recomputeStats(r.world, r.caster);
    for (let i = 0; i < 12; i++) r.dodge(); expect(r.count("read")).toBe(0);
    r.step(); for (let i = 0; i < 12; i++) r.dodge(); expect(r.count("read")).toBeGreaterThan(0);
    r.step(15); const count = r.count("read");
    for (let i = 0; i < 12; i++) r.dodge(); expect(r.count("read")).toBe(count);
  });
  it("fumble, missing event context and other evasion sources cannot impersonate the slide", () => {
    const r = setup(); r.slide();
    r.effects([{ kind: "applyStatus", statusId: "test:fumble" as StatusId, duration: 1, missChance: 1 }], r.enemy);
    expect(r.dispatch(() => rollFumble(r.world, r.enemy, r.caster))).toBe(true);
    fireHooks(r.world, r.caster, "onEvade", r.enemy); expect(r.count("read")).toBe(0);
    const own = r.world.stats.get(r.caster)!.sources.find(s => s.id.includes(".slide"))!;
    own.modifiers = []; r.world.stats.get(r.caster)!.dirty = true;
    attachSource(r.world, r.caster, { id: "test:other-evasion", kind: "item", modifiers: [{ stat: Stat.Evasion, op: ModOp.Flat, value: 0.8 }] });
    recomputeStats(r.world, r.caster); for (let i = 0; i < 12; i++) r.dodge();
    expect(r.count("read")).toBe(0);
  });
  it("E blocks one real hit, pushes the attacker, and opens only that caster's Q follow-up", () => {
    const r = setup(); const hp = r.world.health.get(r.caster)!.hp;
    expect(r.cast("E", { type: "self" })).toBe("ok"); r.hit();
    expect(r.world.health.get(r.caster)!.hp).toBe(hp); expect(r.mark("countered")).toBe(1);
    expect(r.mark("countered", r.enemy, r.ally)).toBe(0); expect(r.count("read")).toBe(0);
    const x = r.world.transform.get(r.enemy)!.pos.x; r.step(4);
    expect(r.world.transform.get(r.enemy)!.pos.x).toBeGreaterThan(x);
    r.hit(); expect(r.world.health.get(r.caster)!.hp).toBeLessThan(hp);
  });
  it("Q consumes one own counter for one extra hit; the next Q stays ordinary", () => {
    const r = setup(); r.cast("E", { type: "self" }); r.hit(); r.step(4);
    r.place(r.enemy, 1.8); expect(r.cast("Q", { type: "entity", entityId: r.enemy }, 6)).toBe("ok");
    expect(r.hits("Q")).toHaveLength(2); expect(r.mark("countered")).toBe(0);
    r.step(25); r.ready("Q"); r.cast("Q", { type: "entity", entityId: r.enemy }, 6);
    expect(r.hits("Q")).toHaveLength(3);
  });
  it("expired or another caster's counter never strengthens Q", () => {
    const r = setup(); r.cast("E", { type: "self" }); r.hit(); r.step(65); r.place(r.enemy, 1.8);
    expect(r.cast("Q", { type: "entity", entityId: r.enemy }, 6)).toBe("ok"); expect(r.hits("Q")).toHaveLength(1);
    const s = setup(); s.cast("E", { type: "self" }, 0, s.ally); s.hit(s.enemy, s.ally); s.step(4); s.place(s.enemy, 1.8);
    s.cast("Q", { type: "entity", entityId: s.enemy }, 6); expect(s.hits("Q")).toHaveLength(1);
    expect(s.mark("countered", s.enemy, s.ally)).toBe(1);
  });
  it("R lasts three seconds and preserves other cooldowns", () => {
    const r = setup(); const stats = r.world.stats.get(r.caster)!;
    const before = [stats.final[Stat.MoveSpeed], stats.final[Stat.AttackSpeed]];
    const q = abilityInstanceFor(r.world.abilities.get(r.caster)!, "Q")!; q.cooldownRemainingTicks = 90;
    expect(r.cast("R", { type: "self" }, 6)).toBe("ok");
    expect(q.cooldownRemainingTicks).toBe(84); expect(stats.final[Stat.MoveSpeed]).toBeGreaterThan(before[0]!);
    expect(stats.final[Stat.AttackSpeed]).toBeGreaterThan(before[1]!);
    r.step(92); expect(stats.final[Stat.MoveSpeed]).toBeCloseTo(before[0]!); expect(stats.final[Stat.AttackSpeed]).toBeCloseTo(before[1]!);
  });
  it("EX requires three reads and own recent engagement before any payment", () => {
    const r = setup(); const hp = r.world.health.get(r.caster)!; const mana = hp.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("no-resource"); expect(hp.mana).toBe(mana);
    r.earnReads(); const start = r.hits("EX").length;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy }, 4)).toBe("ok");
    expect(r.count("read")).toBe(0); expect(r.hits("EX")).toHaveLength(start);
    r.step(12); expect(r.hits("EX")).toHaveLength(start + 1); expect(hp.mana).toBeLessThan(mana);
  });
  it("EX rejects a different or expired engagement without paying or starting approach", () => {
    const r = setup(); r.earnReads(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    const hp = r.world.health.get(r.caster)!; const mana = hp.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.distant })).toBe("target-condition");
    expect(r.count("read")).toBe(3); expect(hp.mana).toBe(mana); expect(approachesOf(r.world).has(r.caster)).toBe(false);
    r.step(130); const expiredMana = hp.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("target-condition");
    expect(r.count("read")).toBe(3); expect(hp.mana).toBe(expiredMana);
  });
  it.each(["basic", "ability"] as const)("earns reads from an actual enemy %s attack during the slide", channel => {
    const r = setup();
    attachSource(r.world, r.enemy, { id: "test:long-reach", kind: "item", modifiers: [{ stat: Stat.AttackRange, op: ModOp.Override, value: 8 }] });
    recomputeStats(r.world, r.enemy);
    for (let attempt = 0; attempt < 8 && r.count("read") === 0; attempt++) {
      r.place(r.caster, 0); r.place(r.enemy, 1.8); r.ready("W");
      if (channel === "basic") { r.world.abilities.get(r.enemy)!.basicAttackCdTicks = 0; r.attack(); }
      else { r.ready("Q", r.enemy); expect(r.cast("Q", { type: "entity", entityId: r.caster }, 0, r.enemy)).toBe("ok"); }
      expect(r.slide(9)).toBe("ok"); r.hold(); r.step(30);
    }
    expect(r.count("read")).toBeGreaterThan(0);
    expect(r.events.some(e => e.type === "evade" && e.data.channel === channel && e.data.duringDash === true)).toBe(true);
  });
  it("a blocked slide cannot earn reads from a stationary dodge", () => {
    const r = setup(); const t = r.world.transform.get(r.caster)!;
    const zone = r.world.arena.zones[0]!;
    t.pos = { x: zone.center.x + zone.boundaryRadius - t.radius, z: zone.center.z };
    r.world.rebuildGrid();
    expect(r.cast("W", { type: "dir", dir: { x: 1, z: 0 } }, 2)).toBe("ok");
    expect(r.world.nav.get(r.caster)!.override).toBeNull();
    for (let i = 0; i < 20; i++) r.dodge(); expect(r.count("read")).toBe(0);
  });
  it("movement after a stationary dodge cannot change the saved event", () => {
    const r = setup(); r.slide(0); recomputeStats(r.world, r.caster); r.world.events.length = 0;
    for (let i = 0; i < 20; i++) rollEvade(r.world, r.enemy, r.caster);
    const saved = [...r.world.events]; expect(saved.some(e => e.type === "evade")).toBe(true);
    r.step(); r.world.events.length = 0; r.world.events.push(...saved); worldHookSystem(r.world);
    expect(r.count("read")).toBe(0);
  });
  it("unrelated shield absorption and other block sources never create E follow-up", () => {
    const r = setup(); r.effects([{ kind: "shield", amount: { flat: 1000 }, duration: 3 }]);
    r.hit(); expect(r.mark("countered")).toBe(0);
    r.cast("E", { type: "self" });
    const own = r.world.stats.get(r.caster)!.sources.find(s => s.id.includes(".parry"))!;
    delete own.block;
    attachSource(r.world, r.caster, { id: "test:other-block", kind: "item", modifiers: [], block: { chance: 1, fraction: 1, damageTypes: ["physical"] } });
    r.hit(); expect(r.mark("countered")).toBe(0);
  });
  it.each(["true", "late"] as const)("E does not counter a %s hit", mode => {
    const r = setup(); r.cast("E", { type: "self" }); if (mode === "late") r.step(16);
    r.hit(r.enemy, r.caster, mode === "true" ? "true" : "physical");
    expect(r.mark("countered")).toBe(0);
  });
  it("EX cannot borrow another player's engagement or silently consume its prerequisite", () => {
    const r = setup(); r.earnReads();
    r.effects([{ kind: "consumeStatus", shape: "single", statusId: r.sid("engaged"), count: "all", appliedBy: "self", onConsumed: [] }], r.enemy);
    r.hit(r.ally, r.enemy); expect(r.mark("engaged", r.enemy, r.ally)).toBe(1);
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("target-condition");
    expect(r.count("read")).toBe(3); expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    r.hit(); expect(r.mark("engaged")).toBe(1);
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("ok");
    expect(r.mark("engaged")).toBe(1); expect(r.mark("engaged", r.enemy, r.ally)).toBe(1);
  });
  it("rejects meaningless target and dodge-field schema combinations", () => {
    const r = setup(); const ex = r.compiled.abilityDrafts.EX;
    expect(zAbilityDoc.safeParse({ ...ex, castType: "self" }).success).toBe(false);
    expect(zHookDef.safeParse({ on: "onInterval", evadeDuring: "dash", effects: [] }).success).toBe(false);
    expect(zHookDef.safeParse({ on: "onEvade", evadeDuring: "teleport", effects: [] }).success).toBe(false);
  });
  it.each([1, 4])("plays the actual six-slot combo deterministically at rank %s", rank => {
    const replay = () => {
      const r = setup(rank); r.earnReads();
      expect(r.cast("E", { type: "self" })).toBe("ok"); r.hit(); r.step(5); r.place(r.enemy, 1.8);
      expect(r.cast("Q", { type: "entity", entityId: r.enemy }, 30)).toBe("ok");
      expect(r.hits("Q")).toHaveLength(2);
      expect(r.cast("R", { type: "self" }, 30)).toBe("ok");
      expect(r.cast("EX", { type: "entity", entityId: r.enemy }, 20)).toBe("ok");
      expect(r.hits("EX")).toHaveLength(1); expect(r.count("read")).toBe(0);
      expect(Number(r.hits("EX")[0]!.data.amount)).toBeGreaterThan(Number(r.hits("Q")[0]!.data.amount));
      return { digest: r.world.digest(), events: r.events };
    };
    expect(replay()).toEqual(replay());
  });
  it.each(["ally", "dead", "other-zone"] as const)("EX rejects a %s target without spending reads, mana or cooldown", mode => {
    const r = setup(); r.earnReads();
    if (mode === "ally") r.world.team.get(r.enemy)!.teamId = r.world.team.get(r.caster)!.teamId;
    if (mode === "dead") r.world.health.get(r.enemy)!.alive = false;
    if (mode === "other-zone") r.world.transform.get(r.enemy)!.zone++;
    const hp = r.world.health.get(r.caster)!; const mana = hp.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("bad-target");
    expect(r.count("read")).toBe(3); expect(hp.mana).toBe(mana);
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
  });
  it("EX rechecks a target prerequisite after approaching, without consuming it on rejection", () => {
    const r = setup(); r.earnReads(); r.step(70); r.place(r.enemy, 10);
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("approaching");
    expect(r.count("read")).toBe(3); r.step(90);
    expect(r.events.some(e => e.type === "castRejected" && e.data.reason === "target-condition")).toBe(true);
    expect(r.count("read")).toBe(3); expect(r.hits("EX")).toHaveLength(0);
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
  });
  it("two genuinely earned reads cannot pay a three-read finisher", () => {
    const r = setup(); r.slide();
    for (let i = 0; i < 40 && r.count("read") < 2; i++) r.dodge();
    expect(r.count("read")).toBe(2); r.step(30); r.place(r.caster, 0);
    const hp = r.world.health.get(r.caster)!; const mana = hp.mana;
    expect(r.cast("EX", { type: "entity", entityId: r.enemy })).toBe("no-resource");
    expect(r.count("read")).toBe(2); expect(hp.mana).toBe(mana);
  });
});
