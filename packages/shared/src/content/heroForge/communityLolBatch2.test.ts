import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId } from "../../ids";
import { Abilities, SimWorld, rankUpAbility, registerChampion, spawnChampion, type IntentFrame, type SimEvent } from "../../sim";
import { extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import type { TemplateDoc } from "../schema/template";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { createCommunityHeroRecipe } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { HERO_SLOTS } from "./constants";
import { compileGeneratedHeroDraft, generateHeroDraft, type CompiledHeroDraftResult } from "./generator";
import { createHeroSimulationBaseline } from "./simulationBaseline";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
const vfxSubtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
const compiled = new Map<string, CompiledHeroDraftResult>();
const failures: unknown[] = [];

beforeAll(() => {
  // One pass collects every hero/slot failure. Compilation proves executable
  // schema compatibility, not fidelity to LoL or readiness for publication.
  for (const recipe of COMMUNITY_LOL_BATCH2_EXAMPLES) {
    try {
      const project = createCommunityHeroRecipe(recipe, `lol-batch2-test-${recipe.id}`, templates);
      const generated = generateHeroDraft(project.acceptedPlan!, {
        heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation,
      });
      const result = compileGeneratedHeroDraft(generated, templates, configs, vfxSubtypes);
      compiled.set(recipe.id, result);
      if (!result.ok) failures.push(...result.failures.map((failure) => ({ hero: recipe.id, ...failure })));
    } catch (error) {
      failures.push({ hero: recipe.id, phase: "project-or-generation", message: String(error) });
    }
  }
});

describe("LoL batch 2 candidate recipes", () => {
  it("compiles all 11 heroes and 66 slots with the shipped templates, resolver configs and VFX subtypes", () => {
    expect(COMMUNITY_LOL_BATCH2_EXAMPLES).toHaveLength(11);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect([...compiled.values()].flatMap((result) => result.ok ? Object.keys(result.draft.abilityDrafts) : [])).toHaveLength(66);
    for (const result of compiled.values()) {
      if (result.ok) expect(Object.keys(result.draft.abilityDrafts)).toEqual(HERO_SLOTS);
    }
  });

  it("Ashe E disarms through a normal cast, allows walking and casting, and restores attacks after expiry", () => {
    const result = compiled.get("ashe");
    expect(result?.ok, JSON.stringify(result ?? failures)).toBe(true);
    if (!result?.ok) return;
    const draft = result.draft;
    const baseline = createHeroSimulationBaseline(catalog.documents);
    const context = extendRegistryContext(baseline.context, "lol-batch2-ashe-e", () => {
      for (const ability of Object.values(draft.abilityDrafts)) Abilities.register(ability.id, ability);
      registerChampion(draft.champion, { overrideAbilities: true });
    });
    withRegistryContext(context, () => {
      const world = new SimWorld(baseline.arena, 0xa5e);
      Object.assign(world, structuredClone(baseline.rules));
      world.combatActive = true;
      const center = baseline.arena.zones[0]!.center;
      const caster = spawnChampion(world, { championId: draft.champion.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...center }, zone: 0, level: 18 });
      const foe = spawnChampion(world, { championId: "thorne", seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: center.x + 1, z: center.z }, zone: 0, level: 18 });
      world.step(new Map());
      expect(rankUpAbility(world, caster, "E")).toBe(true);
      expect(rankUpAbility(world, foe, "W")).toBe(true);
      const events: SimEvent[] = [];
      const step = (foeIntent: IntentFrame = { commands: [] }, casterIntent: IntentFrame = { commands: [] }) => {
        world.step(new Map([[asSeatId(0), casterIntent], [asSeatId(1), foeIntent]]));
        events.push(...world.events);
      };
      const active = () => world.status.get(foe)?.effects.find((effect) => effect.statusId === `${draft.champion.id}.delivery-signature` && effect.expiresAtTick > world.tick);
      step({ commands: [] }, { commands: [{ kind: "castAbility", slot: "E", target: { type: "point", point: { ...world.transform.get(foe)!.pos } } }] });
      expect(events.some((event) => event.type === "abilityCast" && event.data.caster === caster && event.data.abilityId === draft.abilityDrafts.E.id)).toBe(true);
      expect(active()).toBeUndefined();
      for (let tick = 0; tick < 2 * TICK_HZ && !active(); tick++) step();
      const disarm = active();
      expect(disarm).toMatchObject({ disarmed: true });
      expect(disarm?.root).not.toBe(true);
      expect(disarm?.stun).not.toBe(true);
      const activeEvents: SimEvent[] = [];
      const stepWhileDisarmed = (intent: IntentFrame) => {
        expect(active()?.disarmed).toBe(true);
        step(intent);
        if (active()) {
          activeEvents.push(...world.events);
          expect(world.status.get(foe)!.effects.some((effect) => effect.expiresAtTick > world.tick && (effect.root || effect.stun))).toBe(false);
        }
      };

      const from = { ...world.transform.get(foe)!.pos };
      for (let tick = 0; tick < 3; tick++) stepWhileDisarmed({ commands: [], order: { kind: "move", point: { x: from.x, z: from.z + 0.5 } } });
      const moved = world.transform.get(foe)!.pos;
      expect(Math.hypot(moved.x - from.x, moved.z - from.z)).toBeGreaterThan(0);
      stepWhileDisarmed({ commands: [{ kind: "castAbility", slot: "W", target: { type: "self" } }], order: { kind: "stop" } });
      expect(activeEvents.some((event) => event.type === "abilityCast" && event.data.caster === foe && event.data.slot === "W")).toBe(true);
      for (let tick = 0; tick < 2 * TICK_HZ && active(); tick++) stepWhileDisarmed({ commands: [], order: { kind: "attackTarget", entity: caster } });
      expect(activeEvents.filter((event) => (event.type === "attackWindup" || event.type === "basicAttack") && event.data.source === foe)).toEqual([]);
      expect(active()).toBeUndefined();
      const resumed: SimEvent[] = [];
      for (let tick = 0; tick < 3 * TICK_HZ; tick++) {
        step({ commands: [], order: { kind: "attackTarget", entity: caster } });
        resumed.push(...world.events);
      }
      expect(resumed.some((event) => event.type === "attackWindup" && event.data.source === foe)).toBe(true);
      expect(resumed.some((event) => event.type === "basicAttack" && event.data.source === foe)).toBe(true);
    });
  });
});
