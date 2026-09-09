import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Projectiles } from "../../../sim/content/registry";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { addShield } from "../../../sim/combat/damage";
import { healTarget } from "../../../sim/combat/restore";
import { worldHookSystem } from "../../../sim/systems/WorldHookSystem";
import { clearRoundScoped } from "../../../sim/clearPools";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { canSee, isHidden } from "../../../sim/stealth";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { zAbilityDoc } from "../../schema/ability";
import { zEffectDef } from "../../schema/effect";
import type { EntityId, ProjectileId, StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";
import type { EffectDef } from "../../../sim/effects/effect";
import type { ProjectileDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function setup(rank = 1) {
  const r = communityCombatFixture("26", rank);
  for (const [key, doc] of r.source.catalog.documents) if (key.startsWith("projectiles/")) {
    Projectiles.register(key.slice(12) as ProjectileId, doc as unknown as ProjectileDef);
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
  const cast = (slot: CastableSlot, target = r.enemy, caster = r.caster, ticks = 12) => {
    const input = slot === "Q" || slot === "W" ? { type: "dir" as const, dir: { x: 1, z: 0 } }
      : { type: "entity" as const, entityId: target };
    const result = castAbility(r.world, caster, slot, input, { allowApproach: false });
    if (result === "ok") step(ticks); return result;
  };
  const clues = (target = r.enemy, owner = r.caster) => consumableStatusStacks(r.world, target, `${r.project.projectId}.clues` as StatusId, owner);
  const damage = (origin = "basic", amount = 10, source = r.enemy, target = r.ally) => {
    r.world.damageQueue.push({ source, target, amount, type: "true", origin, crit: false }); step(1);
  };
  const effects = (list: EffectDef[], target: EntityId, caster = r.caster) => runEffects(list, {
    world: r.world, caster, targets: [target], rank: 1, origin: "test:authored", rng: r.world.rng,
  });
  const heal = (amount = 10, target = r.enemy, source = r.enemy) => {
    r.world.events.length = 0;
    healTarget(r.world, { source, target, amount, origin: "test:heal", score: true });
    worldHookSystem(r.world); r.world.events.length = 0;
  };
  const control = (source = r.enemy, target = r.ally) => {
    r.world.events.length = 0;
    effects([{ kind: "applyStatus", statusId: "test:sleep" as StatusId, stun: true, duration: 0.2 }], target, source);
    worldHookSystem(r.world); r.world.events.length = 0;
  };
  const hits = (slot: string) => events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.project.projectId}.${slot.toLowerCase()}`);
  const sleeping = () => r.world.status.get(r.enemy)!.effects.some(s => s.statusId.endsWith(".sleep") && s.expiresAtTick > r.world.tick);
  return { ...r, place, step, cast, ready, clues, damage, effects, heal, control, events, hits, sleeping };
}

describe("GH#1132 Conan observed clues, collision and waking sleep", () => {
  it("collects distinct effective events per observed enemy and caps at three", () => {
    const r = setup(); expect(r.clues()).toBe(0);
    r.damage(); r.damage(); r.damage("basic", 10, r.enemy, r.distant); expect(r.clues()).toBe(1);
    r.damage("ability:enemy.q"); r.damage("ability:enemy.w"); expect(r.clues()).toBe(2);
    r.control(); expect(r.clues()).toBe(3);
    r.world.health.get(r.enemy)!.hp -= 10; r.heal(); expect(r.clues()).toBe(3);
    expect(r.hits("PASSIVE")).toHaveLength(0);
  });
  it("counts actual shield absorption, not immunity, zero damage or unrelated damage origins", () => {
    const r = setup(); r.damage("basic", 0); r.damage("item:proc"); expect(r.clues()).toBe(0);
    r.effects([{ kind: "invulnerable", applyTo: "target", durationSec: 0.2 }], r.ally); r.damage(); expect(r.clues()).toBe(0); r.step(8);
    addShield(r.world, r.ally, 200, 3, "test:shield", "all"); const hp = r.world.health.get(r.ally)!.hp;
    r.damage(); expect(r.world.health.get(r.ally)!.hp).toBe(hp); expect(r.clues()).toBe(1);
  });
  it("actual healing can add one clue; overheal and friendly combat do not", () => {
    const r = setup(); r.heal(); expect(r.clues()).toBe(0);
    r.world.health.get(r.enemy)!.hp -= 30; r.heal(); r.heal(); expect(r.clues()).toBe(1);
    r.damage("basic", 10, r.enemy, r.enemy); expect(r.clues()).toBe(1);
    r.damage("basic", 10, r.ally, r.enemy); expect(r.clues(r.ally)).toBe(0);
  });
  it.each(["hidden", "cross-zone", "dead", "settled", "outside-combat"] as const)("does not learn from %s actors", mode => {
    const r = setup();
    if (mode === "hidden") r.world.stealth.set(r.enemy, { fadeDelayTicks: 0, hiddenFromTick: 0 });
    if (mode === "cross-zone") r.world.transform.get(r.enemy)!.zone = 1;
    if (mode === "dead") r.world.health.get(r.enemy)!.alive = false;
    if (mode === "settled") r.world.settledZones.add(r.world.transform.get(r.enemy)!.zone);
    if (mode === "outside-combat") r.world.combatActive = false;
    // Inject only the event to isolate audience eligibility without an attack breaking stealth.
    r.world.events.length = 0;
    r.world.emit("damage", { source: r.enemy, target: r.ally, amount: 10, origin: "basic" });
    worldHookSystem(r.world); expect(r.clues()).toBe(0);
  });
  it("separates targets and observers, and remembers seen categories after R consumption", () => {
    const r = setup(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 8);
    r.damage(); r.damage("ability:enemy.q"); r.damage("basic", 10, r.distant); expect(r.clues()).toBe(2); expect(r.clues(r.distant)).toBe(1);
    expect(r.clues(r.enemy, r.ally)).toBe(2); expect(r.cast("R")).toBe("ok");
    expect(r.clues()).toBe(0); expect(r.clues(r.distant)).toBe(1); expect(r.clues(r.enemy, r.ally)).toBe(2);
    r.damage(); r.damage("ability:enemy.q"); expect(r.clues()).toBe(0);
    r.control(); expect(r.clues()).toBe(1);
  });
  it("clears both clue budget and event identities through the real round cleanup", () => {
    const r = setup(); r.damage(); expect(r.clues()).toBe(1); clearRoundScoped(r.world, r.enemy); expect(r.clues()).toBe(0);
    r.damage(); expect(r.clues()).toBe(1);
  });
  it("R refuses absent, other-owner, friendly and out-of-range clues without paying", () => {
    const r = setup(); const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("R")).toBe("no-resource"); expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    r.damage();
    r.world.stats.get(r.enemy)!.sources = r.world.stats.get(r.enemy)!.sources.filter(s => s.applierId !== r.caster);
    expect(r.clues(r.enemy, r.ally)).toBe(1); expect(r.cast("R")).toBe("no-resource");
    for (const target of [r.ally, r.distant]) { expect(r.cast("R", target)).not.toBe("ok"); expect(r.world.health.get(r.caster)!.mana).toBe(mana); }
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "R")!.cooldownRemainingTicks).toBe(0);
  });
  it.each([1, 4])("rank %i R reveals only the selected enemy, debuffs defenses and expires", rank => {
    const r = setup(rank); r.damage(); const old = r.world.stats.get(r.enemy)!.final[Stat.Armor];
    attachSource(r.world, r.enemy, { id: "test:hidden", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } }); r.step(1);
    expect(isHidden(r.world, r.enemy)).toBe(true); expect(r.cast("R")).toBe("ok");
    expect(r.clues()).toBe(0); expect(isHidden(r.world, r.enemy)).toBe(false); expect(canSee(r.world, r.caster, r.enemy)).toBe(true);
    expect(r.world.stats.get(r.enemy)!.final[Stat.Armor]).toBeLessThan(old);
    expect(r.world.stats.get(r.ally)!.sources.some(s => s.vision?.revealed)).toBe(false);
    r.step(130); expect(r.world.stats.get(r.enemy)!.final[Stat.Armor]).toBeCloseTo(old); expect(isHidden(r.world, r.enemy)).toBe(true);
  });
  it("reveal does not restart stealth and disappears on expiry or removal; digest includes it", () => {
    const r = setup();
    attachSource(r.world, r.enemy, { id: "test:stealth", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } }); r.step();
    expect(isHidden(r.world, r.enemy)).toBe(true);
    r.effects([{ kind: "applyBuff", modifiers: [], duration: 0.5, vision: { revealed: true } }], r.enemy);
    const deadline = r.world.stealth.get(r.enemy)!.hiddenFromTick; expect(isHidden(r.world, r.enemy)).toBe(false);
    const reveal = r.world.stats.get(r.enemy)!.sources.find(s => s.vision?.revealed)!; const before = r.world.digest();
    reveal.vision!.revealed = false; expect(r.world.digest()).not.toBe(before); reveal.vision!.revealed = true;
    r.step(20); expect(isHidden(r.world, r.enemy)).toBe(true); expect(r.world.stealth.get(r.enemy)!.hiddenFromTick).toBe(deadline);
  });
  it("Q resolves the first physical projectile collision exactly once and can miss", () => {
    const r = setup(); r.world.team.get(r.distant)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(r.distant, 7);
    expect(r.cast("Q", r.enemy, r.caster, 4)).toBe("ok"); expect(r.hits("Q")).toHaveLength(0); expect(r.world.projectile.size).toBe(1);
    r.step(40); expect(r.hits("Q").map(e => e.data.target)).toEqual([r.enemy]); expect(r.hits("Q")[0]!.data.type).toBe("physical");
    r.ready("Q"); r.place(r.enemy, 4, 3); r.place(r.distant, 16); expect(r.cast("Q", r.enemy, r.caster, 70)).toBe("ok"); expect(r.hits("Q")).toHaveLength(1);
  });
  it("W is a traveling, single-hit sleep with no immediate damage, and wakes on later HP loss", () => {
    const r = setup(); const hp = r.world.health.get(r.enemy)!.hp;
    expect(r.cast("W", r.enemy, r.caster, 4)).toBe("ok"); expect(r.sleeping()).toBe(false); r.step(8);
    expect(r.sleeping()).toBe(true); expect(r.world.health.get(r.enemy)!.hp).toBe(hp); expect(r.hits("W")).toHaveLength(0);
    r.effects([{ kind: "applyStatus", statusId: "test:slow" as StatusId, duration: 5, moveSpeedMult: 0.8 }], r.enemy);
    r.damage("basic", 10, r.caster, r.enemy); expect(r.sleeping()).toBe(false);
    expect(r.world.status.get(r.enemy)!.effects.some(s => s.statusId === "test:slow")).toBe(true);
  });
  it("zero damage and shield absorption do not wake sleep; natural expiry does", () => {
    const r = setup(); expect(r.cast("W")).toBe("ok"); expect(r.sleeping()).toBe(true);
    addShield(r.world, r.enemy, 100, 3, "test:shield", "all"); r.damage("basic", 0, r.caster, r.enemy); r.damage("basic", 10, r.caster, r.enemy);
    expect(r.sleeping()).toBe(true); r.step(40); expect(r.sleeping()).toBe(false);
  });
  it("R fizzles if its target leaves the duel or dies during windup, without refunding clues", () => {
    for (const invalid of ["zone", "dead"] as const) {
      const r = setup(); r.damage(); expect(r.cast("R", r.enemy, r.caster, 0)).toBe("ok");
      if (invalid === "zone") r.world.transform.get(r.enemy)!.zone = 1;
      else r.world.health.get(r.enemy)!.alive = false;
      r.step(8); expect(r.clues()).toBe(0);
      expect(r.world.stats.get(r.enemy)!.sources.some(s => s.vision?.revealed)).toBe(false);
    }
  });
  it("reveal no longer exposes a bearer that moved to a different duel", () => {
    const r = setup(); r.damage();
    attachSource(r.world, r.enemy, { id: "test:hidden", kind: "item", modifiers: [], vision: { stealthFadeDelaySec: 0 } }); r.step(1);
    expect(r.cast("R")).toBe("ok"); expect(isHidden(r.world, r.enemy)).toBe(false);
    r.world.transform.get(r.enemy)!.zone = 1; expect(isHidden(r.world, r.enemy)).toBe(true);
  });
  it("control immunity rejects W sleep and observation credit; W cooldown prevents a second shot", () => {
    const r = setup(); r.effects([{ kind: "invulnerable", applyTo: "target", blocksControl: true, durationSec: 2 }], r.enemy);
    expect(r.cast("W")).toBe("ok"); expect(r.sleeping()).toBe(false);
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("W")).toBe("cooldown"); expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    const a = setup(); a.effects([{ kind: "invulnerable", applyTo: "target", blocksControl: true, durationSec: 2 }], a.ally);
    a.control(); expect(a.clues()).toBe(0);
  });
  it("schema rejects target-cost on non-targeted spells and observation filters on unrelated hooks", () => {
    expect(zAbilityDoc.safeParse({ ...rAbility(), castType: "self" }).success).toBe(false);
    expect(zEffectDef.safeParse({ kind: "applyBuff", duration: 1, modifiers: [], hooks: [{ on: "onBasicAttack", observedEvent: "heal", effects: [{ kind: "heal", amount: { flat: 1 } }] }] }).success).toBe(false);
  });
});
function rAbility() { return setup().compiled.abilityDrafts.R; }
