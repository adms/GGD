import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId, type EntityId, type StatusId, type ChampionId } from "../../ids";
import { Abilities, SimWorld, rankUpAbility, registerChampion, spawnChampion, type IntentFrame, type SimEvent } from "../../sim";
import { extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import { runEffects } from "../../sim/effects/effectRunner";
import type { TemplateDoc } from "../schema/template";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { createCommunityHeroRecipe } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { compileGeneratedHeroDraft, generateHeroDraft, type CompiledHeroDraftResult } from "./generator";
import { createHeroSimulationBaseline } from "./simulationBaseline";

const catalog = shippedHeroCatalog();
const baseline = createHeroSimulationBaseline(catalog.documents);
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
const vfxSubtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
const compiled = new Map<string, Extract<CompiledHeroDraftResult, { ok: true }>>();

beforeAll(() => {
  for (const id of ["sett", "fiddlesticks"]) {
    const recipe = COMMUNITY_LOL_BATCH2_EXAMPLES.find((entry) => entry.id === id)!;
    const project = createCommunityHeroRecipe(recipe, `lol-mechanics-${id}`, templates);
    const generated = generateHeroDraft(project.acceptedPlan!, {
      heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation,
    });
    const result = compileGeneratedHeroDraft(generated, templates, configs, vfxSubtypes);
    if (!result.ok) throw new Error(JSON.stringify(result.failures));
    compiled.set(id, result);
  }
});

type Rig = {
  world: SimWorld;
  hero: EntityId;
  foes: EntityId[];
  draft: Extract<CompiledHeroDraftResult, { ok: true }>["draft"];
  events: SimEvent[];
  step: (intent?: IntentFrame) => void;
};

function withHero(id: string, spots: [number, number][], run: (rig: Rig) => void) {
  const { draft } = compiled.get(id)!;
  const context = extendRegistryContext(baseline.context, `lol-mechanics-${id}`, () => {
    for (const ability of Object.values(draft.abilityDrafts)) Abilities.register(ability.id, ability);
    registerChampion(draft.champion, { overrideAbilities: true });
  });
  withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, 0x11b2);
    Object.assign(world, structuredClone(baseline.rules));
    world.combatActive = true;
    const center = baseline.arena.zones[0]!.center;
    const hero = spawnChampion(world, { championId: draft.champion.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...center }, zone: 0, level: 18 });
    const foes = spots.map(([dx, dz], index) => spawnChampion(world, { championId: "thorne" as ChampionId, seatId: asSeatId(index + 1), teamId: asTeamId(1), pos: { x: center.x + dx, z: center.z + dz }, zone: 0, level: 18 }));
    const events: SimEvent[] = [];
    const step = (intent: IntentFrame = { commands: [], order: { kind: "hold" } }) => {
      world.step(new Map([
        [asSeatId(0), intent],
        ...foes.map((_, index) => [asSeatId(index + 1), { commands: [], order: { kind: "hold" } }] as [ReturnType<typeof asSeatId>, IntentFrame]),
      ]));
      events.push(...world.events);
    };
    step();
    // Keep all three geometry witnesses alive; no authored damage or range is changed.
    for (const entity of [hero, ...foes]) Object.assign(world.health.get(entity)!, { maxHp: 1_000_000, hp: 1_000_000 });
    world.transform.get(hero)!.facing = { x: 1, z: 0 };
    run({ world, hero, foes, draft, events, step });
  });
}

const damageFrom = (rig: Rig, slot: "W" | "R") => rig.events.filter((event) => event.type === "damage" && event.data.source === rig.hero && String(event.data.origin).includes(rig.draft.abilityDrafts[slot].id));

describe("LoL batch 2 corrected recipe mechanics", () => {
  it.each([0, 2, 3])("Sett W with %i grit hits center as true, sides as physical, never double-hits, and spends existing grit", (stacks) => {
    withHero("sett", [[3, 0], [3, 1.5], [3, 3]], (rig) => {
      const { world, hero, foes, draft, step } = rig;
      expect(rankUpAbility(world, hero, "W")).toBe(true);
      if (stacks > 0) runEffects([{ kind: "applyStatus", statusId: `${draft.champion.id}.grit` as StatusId, duration: 10, sourceScope: "caster", applyTo: "self", stacks }], { world, caster: hero, rank: 1, targets: [], origin: "fixture:grit", rng: world.rng });
      step({ commands: [{ kind: "castAbility", slot: "W", target: { type: "self" } }], order: { kind: "hold" } });
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      const hits = damageFrom(rig, "W");
      expect(world.health.get(hero)!.shields.some((shield) => shield.stackKey === `${draft.champion.id}.w` && shield.amount > 0 && shield.expiresAtTick > world.tick)).toBe(true);
      expect(hits.filter((event) => event.data.target === foes[0]).map((event) => event.data.dmgType)).toEqual(["true"]);
      expect(hits.filter((event) => event.data.target === foes[1]).map((event) => event.data.dmgType)).toEqual(["physical"]);
      expect(hits.filter((event) => event.data.target === foes[2])).toEqual([]);
      expect(world.status.get(hero)!.effects.filter((effect) => effect.statusId === `${draft.champion.id}.grit` && effect.expiresAtTick > world.tick)).toEqual([]);
    });
  });

  it("Sett R carries the selected enemy past its starting position and damages only after travel ends", () => {
    withHero("sett", [[1, 0], [4, 0]], (rig) => {
      const { world, hero, foes, step, events } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      const start = { ...world.transform.get(hero)!.pos };
      step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "entity", entityId: foes[0]! } }] });
      let sawPassenger = false;
      for (let tick = 0; tick < 2 * TICK_HZ && damageFrom(rig, "R").length === 0; tick++) {
        if (world.carried.has(foes[0]!)) {
          sawPassenger = true;
          const carrier = world.transform.get(hero)!.pos;
          const passenger = world.transform.get(foes[0]!)!.pos;
          expect(Math.hypot(passenger.x - carrier.x, passenger.z - carrier.z)).toBeLessThan(0.01);
        }
        if (world.nav.get(hero)?.override?.kind === "dash") expect(damageFrom(rig, "R")).toEqual([]);
        step();
      }
      expect(events.some((event) => event.type === "abilityCast" && event.data.caster === hero && event.data.slot === "R")).toBe(true);
      expect(sawPassenger).toBe(true);
      expect(world.transform.get(hero)!.pos.x - start.x).toBeGreaterThan(2);
      expect(world.transform.get(foes[0]!)!.pos.x - start.x).toBeGreaterThan(2);
      expect(damageFrom(rig, "R").some((event) => event.data.target === foes[1])).toBe(true);
      for (let tick = 0; tick < TICK_HZ; tick++) step();
      expect(world.carried.has(foes[0]!)).toBe(false);
    });
  });

  it("Fiddlesticks R preserves its long startup and starts crow pulses after landing", () => {
    withHero("fiddlesticks", [[4, 0]], (rig) => {
      const { world, hero, foes, draft, step } = rig;
      expect(rankUpAbility(world, hero, "R")).toBe(true);
      expect(draft.abilityDrafts.R.castTimeSec).toBeGreaterThanOrEqual(1);
      step({ commands: [{ kind: "castAbility", slot: "R", target: { type: "point", point: { ...world.transform.get(foes[0]!)!.pos } } }] });
      for (let tick = 0; tick < Math.floor(TICK_HZ / 2); tick++) step();
      expect(damageFrom(rig, "R")).toEqual([]);
      for (let tick = 0; tick < 2 * TICK_HZ; tick++) step();
      const hits = damageFrom(rig, "R");
      expect(hits.length).toBeGreaterThanOrEqual(2);
      expect(hits[1]!.tick).toBeGreaterThan(hits[0]!.tick);
    });
  });
});
