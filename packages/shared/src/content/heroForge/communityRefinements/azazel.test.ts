import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../../testkit/heroPackageFixture";
import { zHeroProject } from "../schema";
import { compileGeneratedHeroDraft, generateHeroDraft } from "../generator";
import type { TemplateDoc } from "../../schema/template";
import { refineAzazelProject, azazelStatusIds } from "./azazel";
import { SimWorld } from "../../../sim/SimWorld";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { Abilities, Projectiles, registerChampion } from "../../../sim/content/registry";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../../../sim/content/defs";
import { spawnChampion } from "../../../sim/spawnChampion";
import { SKELETON_ARENA } from "../../../sim/world/ArenaDef";
import { castAbility, learnEx } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import type { CastableSlot } from "../../../sim/intents";
import { asSeatId, asTeamId, type StatusId, type ProjectileId } from "../../../ids";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { adjustMarkCount } from "../../../sim/marks";
import { hasStatus } from "../../../sim/effects/effectCommon";
import { clearPools } from "../../../sim/clearPools";
import { compileHeroPackageProject, type HeroPackageReplay } from "../../import/heroPackage";
import { defaultHeroPresentation } from "../presentation";
import { runHeroAbilityScenario } from "../scenario";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { runEffects } from "../../../sim/effects/effectRunner";

const source = zHeroProject.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../testkit/fixtures/azazel-handoff.json"), "utf8")));
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, value]) => value as TemplateDoc);
const project = refineAzazelProject(source);
const result = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name }),
  templates, [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, value]) => value));
if (!result.ok) throw new Error(JSON.stringify(result.failures));
const compiled = result.draft;
const ids = azazelStatusIds(project.projectId);
beforeAll(registerSkeletonContent);

function rig() {
  for (const ability of Object.values(compiled.abilityDrafts)) Abilities.register(ability.id, ability as unknown as AbilityDef);
  Projectiles.register("imported.bolt.void" as ProjectileId, catalog.documents.get("projectiles/imported.bolt.void") as unknown as ProjectileDef);
  const champion = compiled.champion as unknown as ChampionDef;
  registerChampion(champion, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 3207); world.ultGateOverride = true;
  const center = SKELETON_ARENA.zones[0]!.center;
  const [caster, second, foe] = [0, 1, 2].map(seat => spawnChampion(world, { zone: 0, championId: champion.id,
    seatId: asSeatId(seat), teamId: asTeamId(seat === 2 ? 1 : 0), pos: { x: center.x + seat * 0.8, z: center.z + 10 }, level: 30 }));
  for (const id of [caster!, second!, foe!]) {
    attachSource(world, id, { id: "fixture-no-regeneration", kind: "item", modifiers: [
      { stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 }, { stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 },
    ] }); recomputeStats(world, id);
    for (const slot of ["Q", "W", "E", "R"] as const) world.abilities.get(id)!.slots[slot].rank = 1;
    expect(learnEx(world, id)).toBe(true); world.nav.get(id)!.order = { kind: "hold" };
  }
  world.transform.get(caster!)!.facing = { x: 1, z: 0 };
  world.transform.get(foe!)!.facing = { x: -1, z: 0 };
  world.rebuildGrid();
  const events: typeof world.events = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) { world.step(new Map()); events.push(...world.events); } };
  const count = (id = caster!) => world.marks.get(id)!.get(ids.energy as StatusId)!.count;
  const fill = (id = caster!) => adjustMarkCount(world, id, ids.energy as StatusId, 3);
  const hp = (id = foe!) => world.health.get(id)!.hp;
  const stat = (key: "ad" | "ap", id = foe!) => { recomputeStats(world, id); return world.stats.get(id)!.final[key]; };
  const cast = (slot: CastableSlot, id = caster!) => {
    const ability = world.abilities.get(id)!;
    abilityInstanceFor(ability, slot)!.cooldownRemainingTicks = 0;
    world.health.get(id)!.mana = world.health.get(id)!.maxMana;
    const before = world.events.length;
    const outcome = castAbility(world, id, slot, slot === "E" ? { type: "self" } : slot === "W"
      ? { type: "point", point: { ...world.transform.get(foe!)!.pos } } : { type: "entity", entityId: foe! });
    events.push(...world.events.slice(before));
    return outcome;
  };
  return { world, caster: caster!, second: second!, foe: foe!, events, step, count, fill, hp, stat, cast };
}

describe("Azazel legacy v1 replay compatibility (current batch is azazelBatch.test.ts)", () => {
  it("single-slot preparation is explicit; the actual kit earns its own EX resources", () => {
    const authored = { ...structuredClone(project), presentation: defaultHeroPresentation() };
    const packet = compileHeroPackageProject(authored, catalog);
    const replay = (packet.scenarios as { replay: HeroPackageReplay }).replay;
    expect(replay.kit.status).toBe("accepted");
    expect(replay.errors).toEqual([]);
    expect(replay.scenarios.find(slot => slot.slot === "EX")!.assertions).toContainEqual(expect.objectContaining({ id: "single-slot-resource-setup", status: "warning" }));
    const opts = { baseline: createHeroSimulationBaseline(catalog.documents), ticks: 180,
      relatedAbilities: Object.values(compiled.abilityDrafts) as unknown as AbilityDef[],
      relatedProjectiles: [catalog.documents.get("projectiles/imported.bolt.void") as unknown as ProjectileDef],
      setup: { ...DEFAULT_HERO_SCENARIO_SETUP, resourceSetup: "empty" as const },
    };
    const empty = runHeroAbilityScenario(compiled.champion as unknown as ChampionDef, compiled.abilityDrafts.EX as unknown as AbilityDef, opts);
    expect(empty.rejectionReason).toBe("no-resource");
    expect(empty.assertions.some(assertion => assertion.id === "single-slot-resource-setup")).toBe(false);
    const unknown = { ...compiled.abilityDrafts.EX, statusCost: { statusId: "not-installed", count: 3 } } as unknown as AbilityDef;
    const missing = runHeroAbilityScenario(compiled.champion as unknown as ChampionDef, unknown, { ...opts, setup: { ...opts.setup, resourceSetup: "ready" } });
    expect(missing.rejectionReason).toBe("no-resource");
  });
  it("precasts the real R for EX preview, preserving expiry, life payment and resource failure", () => {
    const opts = { baseline: createHeroSimulationBaseline(catalog.documents), ticks: 90,
      relatedAbilities: Object.values(compiled.abilityDrafts) as unknown as AbilityDef[],
      relatedProjectiles: [catalog.documents.get("projectiles/imported.bolt.void") as unknown as ProjectileDef],
    };
    const scene = (waitSec: number, resourceSetup: "ready" | "empty" = "ready") => runHeroAbilityScenario(
      compiled.champion as unknown as ChampionDef, compiled.abilityDrafts.EX as unknown as AbilityDef,
      { ...opts, setup: { ...DEFAULT_HERO_SCENARIO_SETUP, resourceSetup, priorCast: { slot: "R", waitSec } } });
    const reversed = scene(1.5);
    expect(reversed.status).toBe("accepted");
    expect(reversed.events.some(event => event.type === "abilityCast" && event.data.abilityId === compiled.abilityDrafts.R.id)).toBe(true);
    expect(reversed.events.some(event => event.type === "healthSpend")).toBe(true);
    expect(JSON.stringify(reversed.events)).toContain("反轉增益");
    expect(reversed.events.filter(event => event.type === "damage" && event.data.origin === `ability:${compiled.abilityDrafts.EX.id}`)).toHaveLength(0);
    expect(reversed.assertions).toContainEqual(expect.objectContaining({ id: "single-slot-prior-cast", summaryZh: expect.stringContaining("前置 R：已施放") }));
    const expired = scene(7);
    expect(expired.status).toBe("accepted");
    expect(JSON.stringify(expired.events)).not.toContain("反轉增益");
    expect(expired.events.some(event => event.type === "damage" && event.data.origin === `ability:${compiled.abilityDrafts.EX.id}`)).toBe(true);
    const insufficient = scene(1.5, "empty");
    expect(insufficient.rejectionReason).toBe("no-resource");
    expect(insufficient.events.some(event => event.type === "abilityCast" && event.data.abilityId === compiled.abilityDrafts.EX.id)).toBe(false);
    const tooEarly = scene(0.1);
    expect(tooEarly.status).toBe("accepted");
    expect(JSON.stringify(tooEarly.events)).not.toContain("反轉增益");
    expect(tooEarly.events.some(event => event.type === "damage" && event.data.origin === `ability:${compiled.abilityDrafts.EX.id}`)).toBe(true);
  });
  it("packages kit-declared statuses but still rejects unknown status and visual dependencies", () => {
    const authored = { ...structuredClone(project), presentation: defaultHeroPresentation() };
    expect(() => compileHeroPackageProject(authored, catalog, false)).not.toThrow();
    authored.acceptedPlan!.slots.EX.abilityOverrides.statusCost = { statusId: "missing-counter", count: 3 };
    expect(() => compileHeroPackageProject(authored, catalog, false)).toThrow("status-effects/missing-counter");
    // Unused template params are not runtime declarations.
    authored.acceptedPlan!.slots.Q.products[0]!.template.params!.unused = { kind: "applyStatus", statusId: "missing-counter", duration: 1 };
    expect(() => compileHeroPackageProject(authored, catalog, false)).toThrow("status-effects/missing-counter");
    authored.acceptedPlan!.slots.EX.abilityOverrides.statusCost = { statusId: ids.energy, count: 3 };
    authored.acceptedPlan!.slots.Q.abilityOverrides.vfxKey = "missing-visual";
    expect(() => compileHeroPackageProject(authored, catalog, false)).toThrow("vfx/missing-visual");
  });
  it("preserves complete original text, source identity, names and model rollback evidence", () => {
    expect(project.sourceDesign).toEqual(source.sourceDesign);
    expect(project.brief).toEqual(source.brief);
    expect(project.presentation).toEqual(source.presentation);
    for (const slot of Object.keys(source.acceptedPlan!.slots) as (keyof typeof compiled.abilityDrafts)[]) {
      expect(compiled.abilityDrafts[slot].name).toBe(source.acceptedPlan!.slots[slot].name);
    }
    expect(project.receipts).toEqual([]);
    expect(project.refinementNotes!.E).toContain("不標記 M07 完成");
    expect(source.acceptedPlan!.slots.E.abilityOverrides.effects).toBeDefined();
    expect(project.acceptedPlan!.slots.E.abilityOverrides.effects).toBeUndefined();
  });

  it("uses compiler-resolved effects, tiers and windup with no unconditional EX damage", () => {
    expect(compiled.abilityDrafts.R.castTimeSec).toBe(0.8);
    expect(compiled.abilityDrafts.PASSIVE.marks?.[0]).toMatchObject({ initial: 0, max: 3, resetOn: "round" });
    expect(compiled.abilityDrafts.EX.effects.map(effect => effect.kind)).toEqual(["consumeStatus"]);
  });

  it("three rain waves hit each enemy once per wave and credit only one cast", () => {
    const r = rig(); expect(r.count()).toBe(0); expect(r.cast("W")).toBe("ok"); r.step(40);
    const hits = r.events.filter(event => event.type === "damage" && (event.data as { source: number; target: number }).source === r.caster && (event.data as { target: number }).target === r.foe);
    expect(hits).toHaveLength(3); expect(r.count()).toBe(1);
    expect(r.cast("Q")).toBe("ok"); r.step(15); expect(r.count()).toBe(2);
  });

  it("R then EX spends exactly three and makes the enemy stronger without ordinary EX damage", () => {
    const r = rig(); const ad = r.stat("ad"), ap = r.stat("ap"); const selfHp = r.hp(r.caster);
    expect(r.cast("R")).toBe("ok"); r.step(20); expect(r.hp(r.caster)).toBe(selfHp); r.step(18);
    expect(r.hp(r.caster)).toBeLessThan(selfHp); expect(r.count()).toBe(1);
    expect(r.stat("ad")).toBeLessThan(ad); expect(r.stat("ap")).toBeLessThan(ap);
    const hp = r.hp(); r.fill(); expect(r.cast("EX")).toBe("ok"); expect(r.count()).toBe(0); r.step(2);
    expect(r.hp()).toBe(hp); expect(r.stat("ad")).toBeGreaterThan(ad); expect(r.stat("ap")).toBeGreaterThan(ap);
    expect(hasStatus(r.world, r.foe, ids.curse as StatusId, r.caster)).toBe(false);
    expect(hasStatus(r.world, r.foe, ids.boon as StatusId, r.caster)).toBe(true);
    expect(JSON.stringify(r.events)).toContain("反轉增益");
    expect(JSON.stringify(r.events)).toContain("怎麼反而變強了");
  });

  it.each(["clean", "cleansed", "expired"])("%s target receives ordinary damage and stronger debuff", state => {
    const r = rig(); const ad = r.stat("ad");
    if (state !== "clean") { expect(r.cast("R")).toBe("ok"); r.step(38); }
    if (state === "cleansed") clearPools(r.world, r.foe, { pools: { buffs: true }, polarity: "debuff", requireDispellable: true });
    if (state === "expired") r.step(130);
    const hp = r.hp(); r.fill(); expect(r.cast("EX")).toBe("ok"); r.step(2);
    expect(r.hp()).toBeLessThan(hp); expect(r.stat("ad")).toBeLessThan(ad);
    expect(hasStatus(r.world, r.foe, ids.exCurse as StatusId, r.caster)).toBe(true);
    expect(hasStatus(r.world, r.foe, ids.boon as StatusId)).toBe(false);
  });

  it("two Azazels reverse only their own curse in the same tick", () => {
    const r = rig(); expect(r.cast("R")).toBe("ok"); expect(r.cast("R", r.second)).toBe("ok"); r.step(38);
    r.fill(); r.fill(r.second); const hp = r.hp();
    expect(r.cast("EX")).toBe("ok");
    expect(hasStatus(r.world, r.foe, ids.curse as StatusId, r.second)).toBe(true);
    expect(r.cast("EX", r.second)).toBe("ok"); r.step(2);
    expect(r.hp()).toBe(hp); expect(r.count()).toBe(0); expect(r.count(r.second)).toBe(0);
  });

  it("control immunity does not change curse reversal", () => {
    const r = rig(); r.cast("R"); r.step(38);
    runEffects([{ kind: "invulnerable", blocksDamage: "none", blocksControl: true, durationSec: 3 }], {
      world: r.world, caster: r.foe, targets: [r.foe], rank: 1, origin: "fixture", rng: r.world.rng,
    }); r.fill(); const hp = r.hp(); expect(r.cast("EX")).toBe("ok"); r.step(2);
    expect(r.hp()).toBe(hp); expect(hasStatus(r.world, r.foe, ids.boon as StatusId, r.caster)).toBe(true);
  });

  it("another caster's R cannot activate this caster's reversal", () => {
    const r = rig(); r.cast("R", r.second); r.step(38); r.fill(); const hp = r.hp();
    expect(r.cast("EX")).toBe("ok"); r.step(2);
    expect(r.hp()).toBeLessThan(hp);
    expect(hasStatus(r.world, r.foe, ids.curse as StatusId, r.second)).toBe(true);
    expect(hasStatus(r.world, r.foe, ids.boon as StatusId, r.caster)).toBe(false);
  });

  it("rain rechecks the landing area instead of following an enemy out of it", () => {
    const r = rig(); r.cast("W"); r.step(8); const hp = r.hp();
    r.world.transform.get(r.foe)!.pos.x += 15; r.world.rebuildGrid(); r.step(35);
    expect(r.hp()).toBe(hp); expect(r.count()).toBe(1);
  });

  it.each(["distant", "immune", "expired"])("%s attacks do not count as successful defense", state => {
    const r = rig(); r.cast("E");
    if (state === "distant") { r.world.transform.get(r.foe)!.pos.x += 8; r.world.rebuildGrid(); }
    if (state === "immune") runEffects([{ kind: "invulnerable", durationSec: 2 }], {
      world: r.world, caster: r.caster, targets: [r.caster], rank: 1, origin: "fixture", rng: r.world.rng,
    });
    if (state === "expired") r.step(20);
    const hp = r.hp();
    r.world.damageQueue.push({ source: r.foe, target: r.caster, type: "physical", amount: 50, origin: "basic", crit: false });
    r.step(2); expect(r.hp()).toBe(hp); expect(r.events.filter(event => event.type === "reflectSuccess")).toHaveLength(0);
    if (state !== "expired") expect(hasStatus(r.world, r.caster, ids.counter as StatusId)).toBe(true);
  });

  it.each([
    [0, 2.5, true], [60, 2, true], [60.01, 2, false],
    [90, 2, false], [180, 2, false], [0, 2.501, false],
  ])("E contact at %s degrees and %s units: defense=%s", (angle, distance, defended) => {
    const r = rig(); r.cast("E");
    // Keep the unrelated ally clear: body separation runs before damage and
    // otherwise changes the boundary we are trying to measure.
    r.world.transform.get(r.second)!.pos.z += 10;
    const defender = r.world.transform.get(r.caster)!;
    const attacker = r.world.transform.get(r.foe)!;
    attacker.pos = { x: defender.pos.x + Math.cos(angle * Math.PI / 180) * distance,
      z: defender.pos.z + Math.sin(angle * Math.PI / 180) * distance };
    r.world.rebuildGrid();
    const hp = r.hp(r.caster), attackerHp = r.hp();
    r.world.damageQueue.push({ source: r.foe, target: r.caster, type: "physical", amount: 50, origin: "basic", crit: false });
    r.step(2);
    expect(r.events.filter(event => event.type === "reflectSuccess")).toHaveLength(defended ? 1 : 0);
    expect(hasStatus(r.world, r.caster, ids.counter as StatusId)).toBe(!defended);
    if (defended) { expect(r.hp(r.caster)).toBe(hp); expect(r.hp()).toBeLessThan(attackerHp); }
    else { expect(r.hp(r.caster)).toBeLessThan(hp); expect(r.hp()).toBe(attackerHp); }
  });

  it("turning after E changes the defended direction; a failed side hit does not spend the window", () => {
    const r = rig(); r.cast("E");
    r.world.transform.get(r.caster)!.facing = { x: 0, z: 1 };
    const attack = () => r.world.damageQueue.push({ source: r.foe, target: r.caster, type: "physical" as const,
      amount: 50, origin: "basic", crit: false });
    attack(); r.step();
    expect(hasStatus(r.world, r.caster, ids.counter as StatusId)).toBe(true);
    expect(r.events.filter(event => event.type === "reflectSuccess")).toHaveLength(0);
    r.world.transform.get(r.caster)!.facing = { x: 1, z: 0 };
    const hp = r.hp(r.caster); attack(); r.step();
    expect(r.hp(r.caster)).toBe(hp);
    expect(r.events.filter(event => event.type === "reflectSuccess")).toHaveLength(1);
    expect(hasStatus(r.world, r.caster, ids.counter as StatusId)).toBe(false);
  });

  it("missing resources reject EX before payment or effect; interrupted R never pays", () => {
    const r = rig(); expect(r.cast("EX")).toBe("no-resource"); const hp = r.hp(), selfHp = r.hp(r.caster);
    expect(r.cast("R")).toBe("ok"); r.world.status.get(r.caster)!.effects.push({ sourceId: "fixture-stun", statusId: "stun" as StatusId, stun: true, expiresAtTick: 60 });
    r.step(40); expect(r.hp()).toBe(hp); expect(r.hp(r.caster)).toBe(selfHp); expect(r.count()).toBe(0);
  });

  it("R at one HP cannot kill its caster or earn self-damage energy", () => {
    const r = rig(); r.world.health.get(r.caster)!.hp = 1;
    r.world.transform.get(r.foe)!.pos.x += 25; r.world.rebuildGrid();
    // Pointing R at an out-of-range target must not release, pay or grant energy.
    expect(r.cast("R")).toBe("approaching"); expect(r.hp(r.caster)).toBe(1); expect(r.count()).toBe(0);
    r.world.transform.get(r.foe)!.pos.x -= 25; r.world.rebuildGrid();
    expect(r.cast("R")).toBe("ok"); r.step(38); expect(r.hp(r.caster)).toBe(1); expect(r.count()).toBe(1);
  });

  it("one close basic hit consumes the defensive window; counters cannot loop or gain energy", () => {
    const r = rig(); const hp = r.hp(r.caster), foeHp = r.hp();
    expect(r.cast("E")).toBe("ok"); expect(r.cast("E", r.foe)).toBe("ok");
    for (let i = 0; i < 2; i++) r.world.damageQueue.push({ source: r.foe, target: r.caster, type: "physical", amount: 50, origin: "basic", crit: false });
    r.step(3);
    expect(r.hp(r.caster)).toBeLessThan(hp); expect(r.hp()).toBeLessThan(foeHp);
    expect(hasStatus(r.world, r.caster, ids.counter as StatusId)).toBe(false);
    expect(hasStatus(r.world, r.foe, ids.counter as StatusId)).toBe(true);
    expect(r.count()).toBe(0); expect(r.count(r.foe)).toBe(0); expect(r.world.damageQueue).toHaveLength(0);
    expect(r.events.filter(event => event.type === "reflectSuccess")).toHaveLength(1);
  });
});
