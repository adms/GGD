import { expect, it } from "vitest";
import { TICK_HZ } from "../../constants";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import { Abilities, SimWorld, registerChampion, spawnChampion, type SimEvent } from "../../sim";
import { extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import type { TemplateDoc } from "../schema/template";
import { compileHeroPackageProject } from "../import/heroPackage";
import { createCommunityHeroExample } from "./communityExamples";
import { createHeroSimulationBaseline } from "./simulationBaseline";

const catalog = shippedHeroCatalog();
const baseline = createHeroSimulationBaseline(catalog.documents);
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);

function withHero(id: string, run: (world: SimWorld, hero: EntityId, foe: EntityId, passiveId: string) => void, distance = 1) {
  const project = createCommunityHeroExample(id, `passive-proof-${id}`, templates);
  const { compiled } = compileHeroPackageProject(project, catalog, false);
  const context = extendRegistryContext(baseline.context, `passive-proof-${id}`, () => {
    for (const ability of Object.values(compiled.abilityDrafts)) Abilities.register(ability.id, ability);
    registerChampion(compiled.champion, { overrideAbilities: true });
  });
  withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, 0xc0ffee);
    Object.assign(world, structuredClone(baseline.rules));
    world.combatActive = true;
    const center = baseline.arena.zones[0]!.center;
    const hero = spawnChampion(world, { championId: compiled.champion.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { ...center }, zone: 0, level: 18 });
    const foe = spawnChampion(world, { championId: compiled.champion.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: center.x + distance, z: center.z }, zone: 0, level: 18 });
    world.step(new Map());
    run(world, hero, foe, compiled.abilityDrafts.PASSIVE.id);
  });
}

function attackTrace(id: string, targetHealthPercent: number) {
  const hits: SimEvent[] = [];
  withHero(id, (world, hero, foe, passiveId) => {
    // Durable targets are scenario setup, not a change to the authored hero.
    for (const entity of [hero, foe]) Object.assign(world.health.get(entity)!, { maxHp: 1_000_000, hp: 1_000_000 });
    world.health.get(foe)!.hp *= targetHealthPercent;
    for (let tick = 0; tick < 12 * TICK_HZ; tick++) {
      world.step(new Map([[asSeatId(0), { commands: [], order: { kind: "attackTarget" as const, entity: foe } }]]));
      hits.push(...world.events.filter((event) => event.type === "damage" && event.data.source === hero && typeof event.data.origin === "string" && event.data.origin.includes(passiveId)));
    }
  });
  return hits;
}

it.each(["warwick", "lux", "yasuo", "missfortune", "leesin", "xerath"])("%s's adapted passive really triggers on attacks and respects its two-second cooldown", (id) => {
  const hits = attackTrace(id, id === "warwick" ? 0.25 : 1);
  expect(hits.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < hits.length; i++) expect(hits[i]!.tick - hits[i - 1]!.tick).toBeGreaterThanOrEqual(2 * TICK_HZ);
});

it("Warwick's passive does not trigger against a healthy target", () => {
  expect(attackTrace("warwick", 1)).toHaveLength(0);
});

it("Karthus consumes his own initial mark to survive once, then dies to a later lethal hit", () => {
  withHero("karthus", (world, hero, foe) => {
    const mark = world.marks.get(hero)!.get("passive-proof-karthus.last-song")!;
    expect(mark.count).toBe(1);
    const hp = world.health.get(hero)!;
    hp.hp = 1;
    const killShot = () => {
      world.damageQueue.push({ source: foe, target: hero, amount: hp.maxHp * 10, type: "true", crit: false, origin: "ability:community-passive-proof" });
      world.step(new Map());
    };
    killShot();
    expect(hp.alive).toBe(true);
    expect(hp.hp).toBeGreaterThan(1);
    expect(mark.count).toBe(0);
    expect(world.events.some((event) => event.type === "lethalSaved")).toBe(true);
    for (let tick = 0; tick < 2 * TICK_HZ; tick++) world.step(new Map());
    hp.hp = 1;
    killShot();
    expect(hp.alive).toBe(false);
    expect(world.events.some((event) => event.type === "lethalSaved")).toBe(false);
  }, 20);
});
