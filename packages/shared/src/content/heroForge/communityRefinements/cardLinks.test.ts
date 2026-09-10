import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { clearRoundScoped } from "../../../sim/clearPools";
import { resetMarksForRound } from "../../../sim/marks";
import { fireHooks } from "../../../sim/effects/hooks";
import type { EntityId, StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";

beforeAll(() => registerSkeletonContent());

function setup(rank = 1) {
  const r = communityCombatFixture("27", rank);
  const resource = `${r.project.projectId}.card-link` as StatusId;
  const count = (id = r.caster) => r.world.marks.get(id)!.get(resource)!.count;
  const cast = (slot: CastableSlot, actor = r.caster, target?: EntityId) => {
    abilityInstanceFor(r.world.abilities.get(actor)!, slot)!.cooldownRemainingTicks = 0;
    r.world.health.get(actor)!.mana = r.world.health.get(actor)!.maxMana;
    const recipient = target ?? (slot === "Q" ? r.enemy : actor);
    const result = castAbility(r.world, actor, slot, { type: "entity", entityId: recipient });
    if (result === "ok") r.step(45); // Allow the real windup and recovery to finish.
    return result;
  };
  const charge = (n: number) => {
    for (const slot of (["Q", "R", "Q"] as const).slice(0, n)) expect(cast(slot)).toBe("ok");
    expect(count()).toBe(n);
  };
  return { ...r, resource, count, cast, charge };
}

describe("GH#1132 card sequence and next-shield resource", () => {
  it("earns links only from alternating completed cards, caps at three and isolates the owner", () => {
    const r = setup();
    expect(r.count()).toBe(0);
    for (const [slot, expected] of [["Q", 1], ["Q", 1], ["R", 2], ["Q", 3], ["R", 3]] as const) {
      expect(r.cast(slot)).toBe("ok"); expect(r.count()).toBe(expected);
      expect(r.count(r.ally)).toBe(0);
    }
    expect(r.cast("Q", r.ally)).toBe("ok");
    expect(r.count(r.ally)).toBe(1); expect(r.count()).toBe(3);
  });

  it.each([[0, 1], [1, 1], [2, 1], [3, 1], [3, 4]] as const)("spends %i existing links before rank %i W, then records W as the next card", (n, rank) => {
    const baseline = setup(rank);
    expect(baseline.cast("W", baseline.caster, baseline.ally)).toBe("ok");
    const baseShield = baseline.shield(baseline.ally);
    expect(baseShield).toBeGreaterThan(0);
    if (rank === 1) expect(baseShield).toBe(120);
    const r = setup(rank); r.charge(n);
    expect(r.cast("W", r.caster, r.ally)).toBe("ok");
    expect(r.shield(r.ally)).toBeCloseTo(baseShield * (1 + n / 6));
    expect(r.shield(r.caster)).toBe(0); expect(r.shield(r.enemy)).toBe(0);
    // W's onAbilityCast is after its effects; it cannot amplify its own shield.
    expect(r.count()).toBe(1); expect(r.count(r.ally)).toBe(0);
    r.step(100); // Let the first shield expire before measuring a fresh shield.
    expect(r.cast("W", r.caster, r.ally)).toBe("ok");
    expect(r.shield(r.ally)).toBeCloseTo(baseShield * 7 / 6);
    expect(r.count()).toBe(0); // Repeated W does not earn another link.
  });

  it("keeps resources and card order on rejected enemy or out-of-range shield casts", () => {
    const r = setup(); r.charge(2);
    const priorSources = structuredClone(r.world.stats.get(r.caster)!.sources);
    for (const target of [r.enemy, r.distant]) {
      const mana = r.world.health.get(r.caster)!.mana;
      expect(castAbility(r.world, r.caster, "W", { type: "entity", entityId: target })).not.toBe("ok");
      expect(r.world.health.get(r.caster)!.mana).toBe(mana);
      expect(r.count()).toBe(2);
      expect(r.world.stats.get(r.caster)!.sources).toEqual(priorSources);
      expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "W")!.cooldownRemainingTicks).toBe(0);
    }
  });

  it("does not gain links or bonus damage from basic-attack hooks", () => {
    const r = setup();
    const effects = r.world.events.length;
    fireHooks(r.world, r.caster, "onBasicAttack", r.enemy);
    expect(r.count()).toBe(0);
    expect(r.world.events.slice(effects).filter(e => e.type === "damage")).toHaveLength(0);
    const hooks = r.compiled.abilityDrafts.PASSIVE.passive?.ranks?.flatMap(rank => rank.hooks ?? []);
    expect(hooks?.every(hook => hook.on === "onAbilityCast")).toBe(true);
  });

  it("resets both links and remembered card at the real round-reset boundaries", () => {
    const r = setup(); r.charge(3);
    clearRoundScoped(r.world, r.caster); resetMarksForRound(r.world);
    expect(r.count()).toBe(0);
    expect(r.cast("Q")).toBe("ok"); expect(r.count()).toBe(1);
  });
});
