import { communityRecipeFixture } from "./communityRecipeFixture";
import { applyCommunityDesignRefinement } from "../src/content/heroForge/communityRefinements/apply";
import { compileGeneratedHeroDraft, generateHeroDraft } from "../src/content/heroForge/generator";
import type { TemplateDoc } from "../src/content/schema/template";
import { SimWorld } from "../src/sim/SimWorld";
import { Abilities, registerChampion } from "../src/sim/content/registry";
import type { AbilityDef, ChampionDef } from "../src/sim/content/defs";
import { spawnChampion } from "../src/sim/spawnChampion";
import { SKELETON_ARENA } from "../src/sim/world/ArenaDef";
import { learnEx } from "../src/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type EntityId } from "../src/ids";
import { eligibleShieldTotal } from "../src/sim/combat/damage";

export function communityCombatFixture(number: string, rank = 1) {
  const source = communityRecipeFixture(number);
  const templates = [...source.catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
  const project = applyCommunityDesignRefinement(source.project, source.refinement, templates);
  const result = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name,
    modelKey: project.presentation.modelKey, presentation: project.presentation }),
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
  const shield = (id: EntityId) => eligibleShieldTotal(world.health.get(id)!.shields, world.tick, "magic");
  const step = (ticks = 12) => { for (let i = 0; i < ticks; i++) world.step(new Map()); };
  return { source, templates, project, compiled, world, caster, ally, enemy, distant, shield, step };
}
