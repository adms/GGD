import { beforeAll, describe, expect, it } from "vitest";
import { communityRecipeFixture } from "../../../../testkit/communityRecipeFixture";
import { applyCommunityDesignRefinement } from "./apply";
import { compileGeneratedHeroDraft, generateHeroDraft } from "../generator";
import type { TemplateDoc } from "../../schema/template";
import { SimWorld } from "../../../sim/SimWorld";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Abilities, Statuses, registerChampion } from "../../../sim/content/registry";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";
import { spawnChampion } from "../../../sim/spawnChampion";
import { SKELETON_ARENA } from "../../../sim/world/ArenaDef";
import { castAbility, learnEx } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../../ids";
import { runEffects } from "../../../sim/effects/effectRunner";
import { hasStatus } from "../../../sim/effects/effectCommon";
import { zEffectDef } from "../../schema/effect";

beforeAll(() => {
  registerSkeletonContent();
  const fear = communityRecipeFixture("37").catalog.documents.get("status-effects/fear")!;
  Statuses.register("fear", fear as { polarity: "debuff"; tags: string[] });
});
function rig(number: string, rank = 1) {
  const source = communityRecipeFixture(number);
  const templates = [...source.catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
  const project = applyCommunityDesignRefinement(source.project, source.refinement, templates);
  const result = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name }),
    templates, [...source.catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc));
  if (!result.ok) throw new Error(JSON.stringify(result.failures));
  const compiled = result.draft;
  for (const ability of Object.values(compiled.abilityDrafts)) Abilities.register(ability.id, ability as unknown as AbilityDef);
  const champion = compiled.champion as unknown as ChampionDef;
  registerChampion(champion, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 1132); world.ultGateOverride = true;
  const center = SKELETON_ARENA.zones[0]!.center;
  const bodies = [0, 1, 2, 3].map(seat => spawnChampion(world, { zone: 0, championId: champion.id,
    seatId: asSeatId(seat), teamId: asTeamId(seat === 2 ? 1 : 0),
    pos: { x: center.x + (seat === 3 ? 15 : seat * 0.7), z: center.z + 8 }, level: 30 }));
  for (const id of bodies) {
    world.nav.get(id)!.order = { kind: "hold" };
    for (const slot of ["Q", "W", "E", "R"] as const) world.abilities.get(id)!.slots[slot].rank = Math.min(rank, compiled.abilityDrafts[slot].maxRank);
    learnEx(world, id); world.health.get(id)!.mana = world.health.get(id)!.maxMana;
  }
  world.rebuildGrid();
  const [caster, ally, enemy, distant] = bodies as [EntityId, EntityId, EntityId, EntityId];
  const shield = (id: EntityId) => world.health.get(id)!.shields.reduce((sum, pool) => sum + pool.amount, 0);
  const step = (ticks = 12) => { for (let i = 0; i < ticks; i++) world.step(new Map()); };
  return { source, templates, project, compiled, world, caster, ally, enemy, distant, shield, step };
}

describe("GH#1132 authored friendly protection", () => {
  it.each([["21", 1], ["21", 4], ["27", 1], ["27", 4]] as const)("%s rank %i shields the selected ally instead of the caster", (number, rank) => {
    const r = rig(number, rank);
    expect(r.compiled.abilityDrafts.W).toMatchObject({ castType: "targeted", targetsEnemies: false });
    expect(r.compiled.abilityDrafts.W.radius).toBeUndefined();
    expect(castAbility(r.world, r.caster, "W", { type: "entity", entityId: r.ally })).toBe("ok"); r.step();
    expect(r.shield(r.ally)).toBeGreaterThan(0);
    expect(r.shield(r.caster)).toBe(0); expect(r.shield(r.enemy)).toBe(0); expect(r.shield(r.distant)).toBe(0);
  });
  it.each(["21", "27"])("%s rejects enemies and distant allies without paying mana or cooldown", number => {
    const r = rig(number);
    for (const target of [r.enemy, r.distant]) {
      const mana = r.world.health.get(r.caster)!.mana;
      expect(castAbility(r.world, r.caster, "W", { type: "entity", entityId: target })).not.toBe("ok");
      expect(r.world.health.get(r.caster)!.mana).toBe(mana);
      expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, "W")!.cooldownRemainingTicks).toBe(0);
    }
    expect(castAbility(r.world, r.caster, "W", { type: "entity", entityId: r.caster })).toBe("ok"); r.step();
    expect(r.shield(r.caster)).toBeGreaterThan(0); expect(r.shield(r.ally)).toBe(0);
  });
  it("Chiikawa protects nearby friends and self, excludes enemies and distant friends, and blocks fear only during the window", () => {
    const r = rig("37");
    expect(castAbility(r.world, r.caster, "EX", { type: "self" })).toBe("ok"); r.step();
    for (const id of [r.caster, r.ally]) expect(r.shield(id)).toBeGreaterThan(0);
    for (const id of [r.enemy, r.distant]) expect(r.shield(id)).toBe(0);
    const fear = () => runEffects([zEffectDef.parse({ kind: "applyStatus", statusId: "fear", feared: true, duration: 1 })], {
      world: r.world, caster: r.enemy, targets: [r.ally], rank: 1, origin: "ability:enemy-fear", rng: r.world.rng,
    });
    fear(); expect(hasStatus(r.world, r.ally, "fear" as StatusId)).toBe(false);
    r.step(100); fear(); expect(hasStatus(r.world, r.ally, "fear" as StatusId)).toBe(true);
  });
  it("preserves originals, keeps unfinished resource requirements visible, pins independent templates and moves the shield visual to its target", () => {
    const r = rig("21"); const original = structuredClone(r.source.project);
    expect(r.project.sourceDesign).toEqual(original.sourceDesign); expect(r.project.brief).toEqual(original.brief);
    expect(r.project.sourceDesign!.slots.W.requiredRefinement).toContain("希望消耗");
    expect(r.project.refinementNotes!.W).toContain("仍待修正");
    expect(r.project.receipts).toEqual([]); expect(r.project.revision).toBe(original.revision + 1);
    expect(r.project.acceptedPlan!.slots.W.products[0]!.template.contentSha256).toMatch(/^sha256:/);
    expect(r.project.presentation.slots.W.script!.segments.find(s => s.kind === "vfx" && s.on === "castEffect")).toMatchObject({ at: "target" });
    r.project.acceptedPlan!.slots.W.products[0]!.template.params!.side = "enemies";
    expect(r.source.project).toEqual(original);
    expect(() => applyCommunityDesignRefinement(original, { ...r.source.refinement, sourceSha256: "0".repeat(64) }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
  });
});
