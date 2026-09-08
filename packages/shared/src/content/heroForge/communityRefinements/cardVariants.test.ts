import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { consumableStatusStacks } from "../../../sim/statusConsumption";
import { clearRoundScoped } from "../../../sim/clearPools";
import { resetMarksForRound } from "../../../sim/marks";
import type { CastableSlot } from "../../../sim/intents";
import type { EntityId, StatusId } from "../../../ids";

beforeAll(() => registerSkeletonContent());

function setup(rank = 1) {
  const r = communityCombatFixture("27", rank);
  const mode = `${r.project.projectId}.tree-card` as StatusId;
  const root = `${r.project.projectId}.tree-root` as StatusId;
  const links = () => r.world.marks.get(r.caster)!.get(`${r.project.projectId}.card-link` as StatusId)!.count;
  const isTree = (id = r.caster) => consumableStatusStacks(r.world, id, mode) > 0;
  const rooted = (id = r.enemy) => r.world.status.get(id)!.effects.some(s => s.statusId === root && s.root && s.expiresAtTick > r.world.tick);
  const instance = (slot: CastableSlot) => abilityInstanceFor(r.world.abilities.get(r.caster)!, slot)!;
  const cast = (slot: CastableSlot, target: EntityId = slot === "Q" ? r.enemy : r.caster, ticks = 45) => {
    const result = castAbility(r.world, r.caster, slot, { type: "entity", entityId: target });
    if (result === "ok") r.step(ticks);
    return result;
  };
  // Setup only: subsequent casts in cooldown assertions never use ready().
  const ready = (slot: CastableSlot) => {
    instance(slot).cooldownRemainingTicks = 0;
    r.world.health.get(r.caster)!.mana = r.world.health.get(r.caster)!.maxMana;
    if (slot === "Q") {
      const caster = r.world.transform.get(r.caster)!;
      r.world.transform.get(r.enemy)!.pos = { x: caster.pos.x + 1.4, z: caster.pos.z };
      r.world.rebuildGrid();
    }
  };
  return { ...r, mode, root, links, isTree, rooted, instance, cast, ready };
}

describe("GH#1132 wind/tree card switching", () => {
  it.each([1, 4])("rank %i wind Q damages and pushes the enemy without binding", rank => {
    const r = setup(rank);
    const before = { ...r.world.transform.get(r.enemy)!.pos };
    const hp = r.world.health.get(r.enemy)!.hp;
    expect(r.cast("Q", r.enemy, 0)).toBe("ok");
    for (let ticks = 0; ticks < 30 && r.links() === 0; ticks++) r.step(1);
    // Damage has its own impact rule. Prove the card's explicit push also ran.
    expect(r.world.nav.get(r.enemy)!.override).toMatchObject({ kind: "knockback", authored: true });
    r.step(10);
    expect(r.world.health.get(r.enemy)!.hp).toBeLessThan(hp);
    expect(r.world.transform.get(r.enemy)!.pos.x).toBeGreaterThan(before.x);
    expect(r.rooted()).toBe(false);
    expect(r.links()).toBe(1);
  });

  it("EX only changes its owner's card; tree Q binds instead of dealing the old EX attack", () => {
    const r = setup();
    const hp = r.world.health.get(r.enemy)!.hp;
    expect(r.cast("EX", r.enemy)).toBe("ok");
    expect(r.isTree()).toBe(true); expect(r.isTree(r.ally)).toBe(false);
    expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
    expect(r.rooted()).toBe(false); expect(r.links()).toBe(0);
    const before = { ...r.world.transform.get(r.enemy)!.pos };
    expect(r.cast("Q", r.enemy, 6)).toBe("ok");
    expect(r.rooted()).toBe(true);
    expect(r.world.transform.get(r.enemy)!.pos.x).toBeCloseTo(before.x, 6);
    expect(r.world.transform.get(r.enemy)!.pos.z).toBeCloseTo(before.z, 6);
    expect(r.world.health.get(r.enemy)!.hp).toBe(hp);
    expect(r.links()).toBe(1);
    r.step(45); expect(r.rooted()).toBe(false);
    r.step(r.instance("EX").cooldownRemainingTicks);
    expect(r.cast("EX")).toBe("ok"); expect(r.isTree()).toBe(false);
    r.ready("Q");
    expect(r.cast("Q", r.enemy, 10)).toBe("ok");
    expect(r.world.health.get(r.enemy)!.hp).toBeLessThan(hp);
    expect(r.rooted()).toBe(false);
  });

  it("cannot switch a card in mid-cast or reset Q cooldown by switching afterward", () => {
    const r = setup(); const q = r.instance("Q");
    expect(r.cast("Q", r.enemy, 0)).toBe("ok");
    expect(r.world.abilities.get(r.caster)!.cast).not.toBeNull();
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("EX", r.caster, 0)).toBe("cooldown");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    expect(r.instance("EX").cooldownRemainingTicks).toBe(0);
    expect(r.isTree()).toBe(false); expect(r.links()).toBe(0);
    r.step(45); expect(r.links()).toBe(1);
    const remaining = q.cooldownRemainingTicks;
    expect(remaining).toBeGreaterThan(45);
    expect(r.cast("EX")).toBe("ok");
    expect(r.instance("Q")).toBe(q);
    expect(q.cooldownRemainingTicks).toBe(remaining - 45);
    expect(r.cast("Q")).toBe("cooldown");
    expect(r.links()).toBe(1);
  });

  it("uses the same Q mana cost in both modes; insufficient mana cannot bind or gain links", () => {
    const r = setup();
    const cost = r.compiled.abilityDrafts.Q.manaCost[0]!;
    const hp = r.world.health.get(r.caster)!;
    hp.mana = cost;
    expect(r.cast("Q", r.enemy, 0)).toBe("ok"); expect(hp.mana).toBe(0);
    r.step(45); expect(r.cast("EX")).toBe("ok");
    r.ready("Q"); hp.mana = cost - 1;
    const before = r.links();
    expect(r.cast("Q")).toBe("no-mana");
    expect(hp.mana).toBe(cost - 1); expect(r.links()).toBe(before);
    expect(r.rooted()).toBe(false); expect(r.instance("Q").cooldownRemainingTicks).toBe(0);
    hp.mana = cost;
    expect(r.cast("Q", r.enemy, 0)).toBe("ok"); expect(hp.mana).toBe(0);
  });

  it("counts wind and tree as different cards while neither switching nor repeating a card adds links", () => {
    const r = setup();
    expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(1);
    expect(r.cast("EX")).toBe("ok"); expect(r.links()).toBe(1);
    r.ready("Q"); expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(2);
    r.ready("Q"); expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(2);
    r.step(r.instance("EX").cooldownRemainingTicks);
    expect(r.cast("EX")).toBe("ok"); expect(r.links()).toBe(2);
    r.ready("Q"); expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(3);
    expect(r.cast("W", r.ally)).toBe("ok");
    expect(r.shield(r.ally)).toBe(180); expect(r.links()).toBe(1);
  });

  it("rejects friendly tree targets without spending mana, cooldown or changing the remembered card", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok");
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.cast("Q", r.ally)).not.toBe("ok");
    expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    expect(r.instance("Q").cooldownRemainingTicks).toBe(0);
    expect(r.rooted(r.ally)).toBe(false); expect(r.links()).toBe(0); expect(r.isTree()).toBe(true);
  });

  it("returns to wind and clears sequence state at the real round boundary", () => {
    const r = setup(); expect(r.cast("EX")).toBe("ok");
    expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(1);
    clearRoundScoped(r.world, r.caster); resetMarksForRound(r.world);
    expect(r.isTree()).toBe(false); expect(r.links()).toBe(0);
    r.ready("Q"); expect(r.cast("Q")).toBe("ok"); expect(r.links()).toBe(1);
  });

  it("preserves source text and old scripts while binding presentation cues to executable branches", () => {
    const r = setup();
    expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.brief).toEqual(r.source.project.brief);
    expect(r.source.project.presentation.slots.Q.script!.segments.some(s => s.kind === "vfx")).toBe(true);
    expect(r.project.presentation.slots.Q.script!.segments.every(s => s.kind === "anim")).toBe(true);
    const cues = r.compiled.abilityDrafts.Q.effects.filter(e => e.kind === "spawnVfx");
    expect(cues).toHaveLength(2);
    expect(cues.every(e => e.condition !== undefined && e.at === "target")).toBe(true);
    // This fixture is refinement v3, rebuilt from the original project, not v1.
    expect(r.source.refinement.version).toBe(3);
    expect(r.project.revision).toBe(r.source.project.revision + 3);
  });
});
