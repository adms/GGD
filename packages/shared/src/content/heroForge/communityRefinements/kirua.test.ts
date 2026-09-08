import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { Abilities } from "../../../sim/content/registry";
import { isToggleOn, toggleUpkeepSystem } from "../../../sim/abilities/toggle";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { fireHooks } from "../../../sim/effects/hooks";
import { hasStatus, statusStacks } from "../../../sim/effects/effectCommon";
import { rollEvade, rollEvadeAbility, rollFumble } from "../../../sim/combat/evasion";
import { worldHookSystem } from "../../../sim/systems/WorldHookSystem";
import { resetMarksForRound } from "../../../sim/marks";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { zAbilityToggle } from "../../schema/ability";
import { zHookDef } from "../../schema/effects/_hook";
import type { EntityId, StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";
import type { EffectDef } from "../../../sim/effects/effect";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityCombatFixture("24", rank), prefix = r.project.projectId;
  r.world.combatFeel = { ...r.world.combatFeel, knockback: { ...r.world.combatFeel.knockback, maxBodies: 0 }, hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) {
    attachSource(r.world, id, { id: "test:durable", kind: "item", modifiers: [
      { stat: Stat.AttackRange, op: ModOp.Override, value: 0 },
      { stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 },
      { stat: Stat.HealthRegen, op: ModOp.Override, value: 0 }, { stat: Stat.ManaRegen, op: ModOp.Override, value: 0 }] });
    recomputeStats(r.world, id); r.world.health.get(id)!.hp = r.world.health.get(id)!.maxHp;
  }
  const start = { ...r.world.transform.get(r.caster)!.pos };
  const events: typeof r.world.events = [];
  const place = (id: EntityId, x: number, z = 0) => {
    r.world.transform.get(id)!.pos = { x: start.x + x, z: start.z + z }; r.world.rebuildGrid();
  };
  place(r.caster, 0); place(r.ally, -2); place(r.enemy, 1); place(r.distant, -15);
  r.world.combatActive = true;
  const step = (n = 12) => { for (let i = 0; i < n; i++) { r.world.step(new Map()); events.push(...r.world.events); } };
  const mark = (name = "electricity", id = r.caster) => r.world.marks.get(id)!.get(`${prefix}.${name}` as StatusId);
  const energy = () => mark()!.count;
  const setEnergy = (n: number, id = r.caster) => { mark("electricity", id)!.count = n; };
  const cast = (slot: CastableSlot, ticks = 4, caster = r.caster) => {
    const input = slot === "Q" || slot === "W" ? { type: "point" as const, point: { ...r.world.transform.get(r.enemy)!.pos } } : { type: "self" as const };
    const result = castAbility(r.world, caster, slot, input); if (result === "ok") step(ticks); return result;
  };
  const ready = (slot: CastableSlot) => { abilityInstanceFor(r.world.abilities.get(r.caster)!, slot)!.cooldownRemainingTicks = 0; };
  const damage = (origin = "basic", source = r.enemy, target = r.caster) => {
    r.world.damageQueue.push({ source, target, amount: 10, type: "physical", origin, crit: false }); step(1);
  };
  const effects = (list: EffectDef[], target = r.caster, caster = r.caster) => runEffects(list, {
    world: r.world, caster, targets: [target], rank: 1, origin: "test:effect", rng: r.world.rng,
  });
  const dispatch = (action: () => unknown) => { r.world.events.length = 0; const result = action(); worldHookSystem(r.world); events.push(...r.world.events); r.world.events.length = 0; return result; };
  const dodge = () => dispatch(() => rollEvade(r.world, r.enemy, r.caster));
  const speed = () => r.world.stats.get(r.caster)!.final[Stat.MoveSpeed];
  const reflexes = () => events.filter(e => e.type === "damage" && String(e.data.origin).includes("r.reflex"));
  const hits = (slot: string) => events.filter(e => e.type === "damage" && e.data.origin === `ability:${prefix}.${slot.toLowerCase()}`);
  step(1);
  return { ...r, prefix, step, place, cast, ready, energy, setEnergy, mark, effects, dispatch, dodge, speed, damage, reflexes, hits, events };
}

describe("GH#1132 Kirua authored six slots", () => {
  it("charges gradually after three seconds without attacking, caps at ten and resets per round", () => {
    const r = setup(); expect(r.energy()).toBe(10); r.setEnergy(4);
    fireHooks(r.world, r.caster, "onAttackAttempt", r.enemy);
    r.step(89); expect(r.energy()).toBe(4); r.step(2); expect(r.energy()).toBe(5); r.step(30); expect(r.energy()).toBe(6);
    r.step(240); expect(r.energy()).toBe(10); r.setEnergy(0); resetMarksForRound(r.world); expect(r.energy()).toBe(10);
    expect(r.hits("PASSIVE")).toHaveLength(0);
  });
  it.each(["fumble", "evade", "cancel"] as const)("a real %s attack resets recharge without a successful hit", mode => {
    const r = setup(); r.setEnergy(4);
    if (mode === "fumble") r.effects([{ kind: "applyStatus", statusId: "test:miss" as StatusId, duration: 5, missChance: 1 }]);
    if (mode === "evade") r.effects([{ kind: "applyBuff", duration: 5, modifiers: [{ stat: Stat.Evasion, op: ModOp.Override, value: 1 }] }], r.enemy);
    const nav = r.world.nav.get(r.caster)!;
    nav.order = { kind: "attackTarget", target: r.enemy }; nav.attackTarget = r.enemy;
    r.step(1); expect(r.world.abilities.get(r.caster)!.basicAttackCdTicks).toBeGreaterThan(0);
    const busy = `${r.prefix}.busy` as StatusId;
    expect(hasStatus(r.world, r.caster, busy)).toBe(true);
    if (mode === "cancel") r.place(r.enemy, 12);
    r.step(12); nav.order = { kind: "hold" }; nav.attackTarget = null;
    r.world.abilities.get(r.caster)!.basicAttackCdTicks = 10000;
    expect(r.events.some(e => e.type === "damage" && e.data.source === r.caster)).toBe(false);
    r.step(65); expect(r.energy()).toBe(4); r.step(45); expect(r.energy()).toBeGreaterThan(4);
  });
  it("ongoing hostile combat delays recharge and never grants on-attack damage", () => {
    const r = setup(); r.setEnergy(3);
    for (let n = 0; n < 5; n++) { r.damage(); r.step(25); }
    expect(r.energy()).toBe(3); expect(r.hits("PASSIVE")).toHaveLength(0);
  });
  it.each([1, 4])("rank %i uses electricity, rejecting insufficient costs without spending mana/cooldown", rank => {
    const r = setup(rank); const hp = r.world.health.get(r.caster)!; hp.mana = 0;
    r.setEnergy(1); expect(r.cast("Q")).toBe("no-resource"); expect(r.energy()).toBe(1);
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "Q")!.cooldownRemainingTicks).toBe(0);
    r.setEnergy(2); expect(r.cast("Q", 0)).toBe("ok"); expect(r.energy()).toBe(0); expect(hp.mana).toBe(0);
  });
  it("Q resolves the chosen small area after its delay, including entry and escape", () => {
    const r = setup(); r.place(r.enemy, 4);
    expect(r.cast("Q")).toBe("ok"); expect(r.hits("Q")).toHaveLength(0);
    r.place(r.enemy, 8); r.place(r.distant, 4); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId;
    r.step(20); expect(r.hits("Q").map(e => e.data.target)).toEqual([r.distant]);
  });
  it("W moves along the ground with no landing damage and awards at most one real dodge", () => {
    const r = setup(); r.setEnergy(5); const start = { ...r.world.transform.get(r.caster)!.pos };
    expect(r.cast("W")).toBe("ok"); expect(r.energy()).toBe(4);
    let dodged = false; for (let n = 0; n < 12; n++) dodged = Boolean(r.dodge()) || dodged;
    expect(dodged).toBe(true); expect(r.energy()).toBe(6);
    r.step(10); expect(r.world.transform.get(r.caster)!.pos.x).toBeGreaterThan(start.x);
    expect(r.events.some(e => e.type === "leap")).toBe(false); expect(r.hits("W")).toHaveLength(0);
    r.step(20); const before = r.energy(); for (let n = 0; n < 12; n++) r.dodge(); expect(r.energy()).toBe(before);
  });
  it("W does not award electricity for attacker fumble or an unproven onEvade event", () => {
    const r = setup(); r.setEnergy(5); r.cast("W");
    r.effects([{ kind: "applyStatus", statusId: "test:fumble" as StatusId, duration: 1, missChance: 1 }], r.enemy);
    expect(r.dispatch(() => rollFumble(r.world, r.enemy, r.caster))).toBe(true);
    fireHooks(r.world, r.caster, "onEvade", r.enemy); expect(r.energy()).toBe(4);
    r.dodge(); r.dodge(); r.dodge(); expect(r.energy()).toBe(6);
  });
  it("W never claims another grant's real dodge and does not spend its own one-trigger budget", () => {
    const r = setup(); r.setEnergy(5); r.cast("W");
    const own = r.world.stats.get(r.caster)!.sources.find(s => s.id.includes("w.evade"))!;
    const modifiers = own.modifiers; own.modifiers = []; r.world.stats.get(r.caster)!.dirty = true;
    attachSource(r.world, r.caster, { id: "test:other-evasion", kind: "item", modifiers: [{ stat: Stat.Evasion, op: ModOp.Flat, value: 0.8 }] }); recomputeStats(r.world, r.caster);
    for (let n = 0; n < 12; n++) r.dodge(); expect(r.energy()).toBe(4);
    r.world.stats.get(r.caster)!.sources = r.world.stats.get(r.caster)!.sources.filter(s => s.id !== "test:other-evasion");
    own.modifiers = modifiers; r.world.stats.get(r.caster)!.dirty = true; recomputeStats(r.world, r.caster);
    for (let n = 0; n < 12; n++) r.dodge(); expect(r.energy()).toBe(6);
  });
  it("W invulnerability with no actual dodge grants no resource", () => {
    const r = setup(); r.setEnergy(5); r.cast("W");
    r.effects([{ kind: "invulnerable", durationSec: 1 }]); r.damage(); expect(r.energy()).toBe(4);
  });
  it("E is a real toggle with per-second upkeep, blocked recharge and immediate manual cleanup", () => {
    const r = setup(); const speed = r.speed(); expect(r.cast("E")).toBe("ok");
    expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(true); expect(r.energy()).toBe(9); expect(r.speed()).toBeGreaterThan(speed);
    r.step(120); expect(r.energy()).toBe(5); expect(r.speed()).toBeGreaterThan(speed);
    expect(r.cast("E", 1)).toBe("ok"); expect(r.energy()).toBe(5); expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(false); expect(r.speed()).toBeCloseTo(speed);
  });
  it("E removes speed on the last paid electricity rather than waiting another interval", () => {
    const r = setup(); const speed = r.speed(); r.setEnergy(2); r.cast("E"); r.step(30);
    expect(r.energy()).toBe(0); expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(false); expect(r.speed()).toBeCloseTo(speed);
    expect(r.cast("E")).toBe("no-resource");
  });
  it("status upkeep can charge per actual attack and opt out of auto-exit without partial payment", () => {
    const r = setup(); const original = Abilities.get(r.compiled.abilityDrafts.E.id);
    const def = { ...original, toggle: { ...original.toggle!, upkeepCadence: "perAttack" as const, upkeepCost: [2], upkeepIntervalSec: undefined, exitOnResourceEmpty: false } };
    Abilities.register(def.id, def);
    try {
      r.setEnergy(4); r.cast("E"); const hp = r.world.health.get(r.caster)!.hp;
      r.world.events.length = 0; toggleUpkeepSystem(r.world); expect(r.energy()).toBe(3);
      r.world.events.push({ type: "basicAttack", tick: r.world.tick, data: { source: r.caster } });
      toggleUpkeepSystem(r.world); expect(r.energy()).toBe(1);
      toggleUpkeepSystem(r.world); expect(r.energy()).toBe(1); expect(r.world.health.get(r.caster)!.hp).toBe(hp);
      expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(true);
      r.cast("E", 1); expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(false);
    } finally { Abilities.register(original.id, original); }
  });
  it("status upkeep respects caster ownership and preserves unaffordable stacks", () => {
    const r = setup(); const fuel = "test:owned-fuel" as StatusId;
    const original = Abilities.get(r.compiled.abilityDrafts.E.id);
    Abilities.register(original.id, { ...original, toggle: { ...original.toggle!, upkeepCost: [2], upkeepStatus: { statusId: fuel, appliedBy: "self" } } });
    try {
      r.effects([{ kind: "applyStatus", sourceScope: "caster", statusId: fuel, stacks: 1, duration: 5 }]);
      r.effects([{ kind: "applyStatus", sourceScope: "caster", statusId: fuel, stacks: 3, duration: 5 }], r.caster, r.ally);
      r.cast("E"); r.step(30);
      expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(false);
      expect(statusStacks(r.world, r.caster, fuel, r.caster)).toBe(1);
      expect(statusStacks(r.world, r.caster, fuel, r.ally)).toBe(3);
    } finally { Abilities.register(original.id, original); }
  });
  it("R spends two electricity per nearby basic counter, shares cooldown and stops after three", () => {
    const r = setup(); expect(r.cast("R")).toBe("ok"); expect(r.energy()).toBe(9);
    r.damage(); expect(r.energy()).toBe(7); expect(r.mark("reaction")!.count).toBe(2);
    r.damage(); expect(r.energy()).toBe(7);
    for (let n = 0; n < 3; n++) { r.step(16); r.damage(); }
    expect(r.energy()).toBe(3); expect(r.mark("reaction")!.count).toBe(0); expect(r.reflexes()).toHaveLength(3);
  });
  it("R ignores spell damage, other derived damage, friendly attacks and far attacks without burning budget", () => {
    const r = setup(); r.cast("R"); r.damage("ability:test.q"); r.damage("hook:test:counter"); r.damage("basic", r.ally);
    r.place(r.enemy, 8); r.damage(); expect(r.energy()).toBe(9); expect(r.mark("reaction")!.count).toBe(3);
    r.place(r.enemy, 1); r.damage(); expect(r.energy()).toBe(7);
  });
  it("R refuses unaffordable counters, expires at five seconds and cannot loop against another R", () => {
    const r = setup(); r.cast("R"); r.setEnergy(1); r.damage(); expect(r.mark("reaction")!.count).toBe(3);
    r.setEnergy(8); r.cast("R", 4, r.enemy); r.damage(); r.step(3); expect(r.reflexes()).toHaveLength(1);
    r.step(160); const count = r.reflexes().length; r.damage(); expect(r.reflexes()).toHaveLength(count);
  });
  it("R counts genuine basic dodges and hits against one common budget and interval", () => {
    const r = setup(); r.cast("R"); r.cast("W"); r.place(r.enemy, 1);
    for (let n = 0; n < 12; n++) r.dodge(); expect(r.mark("reaction")!.count).toBe(2);
    const energy = r.energy(); r.damage(); expect(r.energy()).toBe(energy);
    r.step(17); r.damage(); expect(r.mark("reaction")!.count).toBe(1);
  });
  it("R excludes ability evasion and attacker fumble", () => {
    const r = setup(); r.cast("R");
    attachSource(r.world, r.caster, { id: "test:spell-evasion", kind: "item", modifiers: [{ stat: Stat.Evasion, op: ModOp.Flat, value: 0.8 }], evasionScope: { abilities: true } }); recomputeStats(r.world, r.caster);
    for (let n = 0; n < 12; n++) r.dispatch(() => rollEvadeAbility(r.world, r.enemy, r.caster, false));
    r.effects([{ kind: "applyStatus", statusId: "test:fumble" as StatusId, duration: 1, missChance: 1 }], r.enemy);
    r.dispatch(() => rollFumble(r.world, r.enemy, r.caster)); expect(r.energy()).toBe(9); expect(r.mark("reaction")!.count).toBe(3);
  });
  it.each([1, 7, 10])("EX atomically spends all %i electricity, ends E, hits nearby enemies and blocks recharge", count => {
    const r = setup(); const speed = r.speed(); r.cast("E"); r.setEnergy(count);
    expect(r.cast("EX", 0)).toBe("ok"); expect(r.energy()).toBe(0); expect(r.cast("Q")).not.toBe("ok");
    r.step(12); expect(r.hits("EX").map(e => e.data.target)).toEqual([r.enemy]);
    expect(isToggleOn(r.world.abilities.get(r.caster)!, "E")).toBe(false); expect(r.speed()).toBeCloseTo(speed);
    expect(hasStatus(r.world, r.caster, `${r.prefix}.low-electricity` as StatusId)).toBe(true);
    r.step(70); expect(r.energy()).toBe(0); r.step(55); expect(r.energy()).toBeGreaterThan(0);
  });
  it("EX at zero resource rejects without cooldown, effects or a low-state penalty", () => {
    const r = setup(); r.setEnergy(0); expect(r.cast("EX")).toBe("no-resource");
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "EX")!.cooldownRemainingTicks).toBe(0);
    expect(hasStatus(r.world, r.caster, `${r.prefix}.low-electricity` as StatusId)).toBe(false);
  });
  it("rejects incomplete status-upkeep configurations and evade filters on unrelated events", () => {
    const r = setup(); const toggle = r.compiled.abilityDrafts.E.toggle!;
    for (const patch of [{ upkeepStatus: undefined }, { upkeepResource: "mana" }, { upkeepCadence: "none", upkeepIntervalSec: undefined }, { upkeepCost: [0.5] }]) {
      expect(zAbilityToggle.safeParse({ ...toggle, ...patch }).success).toBe(false);
    }
    expect(zHookDef.safeParse({ on: "onDamageTaken", evadeSource: "thisSource", effects: [] }).success).toBe(false);
    expect(zHookDef.safeParse({ on: "onBasicAttack", evadeChannel: "basic", effects: [] }).success).toBe(false);
  });
  it("replays the same authored electricity/combat sequence deterministically", () => {
    const play = () => { const r = setup(); r.cast("R"); r.damage(); r.step(17); r.cast("W"); r.dodge(); r.step(20); r.cast("E"); r.step(31); r.cast("EX"); r.step(140); return r.world.digest(); };
    expect(play()).toEqual(play());
  });
});
