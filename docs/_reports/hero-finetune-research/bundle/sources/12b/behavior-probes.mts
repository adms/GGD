/** CPU-only source fidelity probes. Research copies only; no production recipe writes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { shippedHeroCatalog } from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import { compileHeroPackageProject } from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import { pinHeroPlanTemplates } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import { zHeroProject } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import { createHeroSimulationBaseline } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/simulationBaseline.ts';
import { extendRegistryContext, withRegistryContext } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registryContext.ts';
import { Abilities, registerChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import { SimWorld } from '../../GGD-community-hero-forge/packages/shared/src/sim/SimWorld.ts';
import { spawnChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/spawnChampion.ts';
import { asSeatId, asTeamId } from '../../GGD-community-hero-forge/packages/shared/src/ids.ts';
import { normalizeCombatEnv } from '../../GGD-community-hero-forge/packages/shared/src/sim/combatEnv.ts';
import type { TemplateDoc } from '../../GGD-community-hero-forge/packages/shared/src/content/schema/template.ts';
import { randomAreaQueue } from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/randomArea.ts';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
assert.equal(process.argv.length, 3, 'USAGE: node --import tsx behavior-probes.mts NEW_OUTPUT_DIRECTORY');
const out = path.resolve(process.argv[2]); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(here, p), 'utf8'));
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const pins = read('current-engine-v1/source-pins.json');
const checkPins = () => { for (const p of pins) assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, `ENGINE_DRIFT:${p.path}`); };
checkPins();
const refs = read('current-engine-v1/compiled-references.private.json');
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith('ability-templates/')).map(([, t]) => t as TemplateDoc);
const catalogPins = [...catalog.documents].map(([key, doc]) => ({ key, sha256: hash(JSON.stringify(doc)) })).sort((a, b) => a.key.localeCompare(b.key));
assert.deepEqual(catalogPins, read('current-engine-v1/catalog-pins.json'), 'CATALOG_DRIFT');
const baseline = createHeroSimulationBaseline(catalog.documents);

function candidateProject(reference: any, slot: 'E' | 'R') {
  const project = zHeroProject.parse(structuredClone(reference.project));
  const plan = project.acceptedPlan!;
  const tier = reference.id === 'community7-xerath' ? '小' : '極小';
  const damageType = reference.id === 'community7-missfortune' && slot === 'R' ? 'physical' : 'magic';
  const damage = { kind: 'damage', damageType, amount: { damageTier: tier } };
  // Only E's explicit per-second amount is adjudicated. R geometry/timing values
  // below are bounded research proposals, not inferred Owner requirements.
  // Current author-effect schema requires a positive placeholder radius even
  // with radiusTier; the real tier resolver replaces it before simulation.
  const effects = slot === 'E' ? [{ kind: 'delayed', shape: 'circle', radius: 1, radiusTier: '小', side: 'enemies',
    delaySec: 1, count: 3, intervalSec: 1, targetMode: 'reresolve', effects: [damage] }]
    : reference.id === 'community7-xerath' ? [{ kind: 'delayed', shape: 'circle', radius: 5.5, side: 'enemies',
      delaySec: 0.03333333333333333, count: 3, intervalSec: 0.5, targetMode: 'reresolve', effects: [damage] }]
      : [{ kind: 'randomArea', who: 'target', count: [6, 6, 6], intervalSec: 0.2, scatterRadius: 0.5,
        firstAtCast: true, effects: [{ kind: 'damageArea', radius: 5.5,
          damageType, amount: { damageTier: tier }, includeOrigin: true }] }];
  plan.slots[slot].products[0]!.template = { ref: 'tpl-effect-sequence', inheritDefaults: true,
    params: { castType: 'ground', radius: slot === 'E' ? 4.5 : 5.5, side: 'enemies', effects } };
  project.acceptedPlan = pinHeroPlanTemplates(plan, templates);
  return project;
}

function run(compiled: any, slot: 'E' | 'R', movement: 'stay' | 'leave' | 'enter', seed: number) {
  const ability = compiled.abilityDrafts[slot];
  const context = extendRegistryContext(baseline.context, 'source-fidelity-probe', () => {
    for (const a of Object.values(compiled.abilityDrafts) as any[]) Abilities.register(a.id, a);
    registerChampion(compiled.champion, { overrideAbilities: true });
  });
  return withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, seed); Object.assign(world, structuredClone(baseline.rules));
    world.ultGateOverride = true; world.combatActive = true;
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = { ...world.combatFeel, autoEngage: { ...world.combatFeel.autoEngage, enabled: false } };
    const center = baseline.arena.zones[0]!.center, point = { x: center.x + 1, z: center.z + 10 };
    const spawn = (seat: number, x: number) => spawnChampion(world, { zone: 0, championId: compiled.champion.id,
      seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: center.x + x, z: center.z + 10 }, level: 18 });
    const caster = spawn(0, 0), foe = spawn(1, movement === 'enter' ? 16 : 1);
    for (const id of [caster, foe]) { world.nav.get(id)!.order = { kind: 'hold' };
      const hp = world.health.get(id)!; hp.maxHp = hp.hp = 1_000_000; hp.maxMana = hp.mana = 100_000; }
    world.abilities.get(caster)!.slots[slot].rank = 1;
    world.rebuildGrid();
    const events: any[] = [], queueSnapshots: any[] = [];
    let moved = false;
    const movementAt = Math.ceil((ability.castTimeSec + (slot === 'E' ? 1.1 : 0.1)) / world.dt);
    for (let i = 0; i < 140; i++) {
      if (!moved && movement !== 'stay' && i === movementAt) {
        world.transform.get(foe)!.pos = { x: center.x + (movement === 'leave' ? 16 : 1), z: center.z + 10 };
        world.rebuildGrid(); moved = true;
      }
      world.step(i === 0 ? new Map([[asSeatId(0), { commands: [{ kind: 'castAbility' as const, slot,
        target: { type: 'point' as const, point } }] }]]) : new Map());
      events.push(...world.events.map(e => ({ ...structuredClone(e), foePos: { ...world.transform.get(foe)!.pos } })));
      if (randomAreaQueue(world).length && !queueSnapshots.length) queueSnapshots.push(structuredClone(randomAreaQueue(world)));
    }
    assert(events.some(e => e.type === 'abilityCast' && e.data.caster === caster && e.data.abilityId === ability.id), 'CAST_NOT_OBSERVED');
    assert(world.health.get(foe)!.alive, 'FIXTURE_TARGET_DIED');
    const hits = events.filter(e => e.type === 'damage' && e.data.source === caster && e.data.target === foe && String(e.data.origin).includes(ability.id));
    assert(hits.every(e => e.data.amount > 0), 'NONPOSITIVE_DAMAGE');
    return { seed, movement, movementAtTick: movement !== 'stay' ? movementAt : null, abilityId: ability.id,
      castType: ability.castType, compiledEffects: ability.effects, hits, queueSnapshots,
      castEvents: events.filter(e => ['abilityCast', 'castRejected'].includes(e.type)),
      fixture: 'Real compiled ability through world.step; rank 1, 18-level actors, hold orders, autoEngage off, enlarged HP/mana only to prevent death/exhaustion; no VFX validation.' };
  });
}

const results: any[] = [], candidates: any[] = [];
for (const [id, slot] of [['community7-lux', 'E'], ['community7-missfortune', 'E'], ['community7-missfortune', 'R'], ['community7-xerath', 'R']] as const) {
  const ref = refs.find((r: any) => r.id === id); assert(ref);
  const original = compileHeroPackageProject(zHeroProject.parse(ref.project), catalog, false).compiled;
  assert.deepEqual(original, ref.compiled, 'REFERENCE_COMPILE_DRIFT');
  const project = candidateProject(ref, slot), candidate = compileHeroPackageProject(project, catalog, false).compiled;
  candidates.push({ id, slot, project, compiled: candidate, trainingAdmitted: false, releaseQualified: false });
  for (const seed of [20260908, 20260909]) {
    for (const movement of ['stay', 'leave', 'enter'] as const) {
      const before = run(original, slot, movement, seed), after = run(candidate, slot, movement, seed);
      const expected = slot === 'R' && id === 'community7-missfortune' ? 6 : 3;
      if (movement === 'stay') {
        assert.equal(before.hits.length, expected, 'ORIGINAL_STATIC_COUNT'); assert.equal(after.hits.length, expected, 'CANDIDATE_STATIC_COUNT');
        if (slot === 'E') for (let i = 0; i < expected; i++) assert(Math.abs(after.hits[i].data.amount / before.hits[i].data.amount - 3) < 1e-6, 'PER_PULSE_TIER_RATIO');
      } else {
        assert.equal(after.hits.length, movement === 'leave' ? 1 : expected - 1, 'CANDIDATE_SPATIAL_REEVALUATION');
        assert.equal(before.hits.length, slot === 'E' ? after.hits.length : movement === 'leave' ? expected : 0, 'ORIGINAL_SPATIAL_BEHAVIOR');
      }
      results.push({ id, slot, seed, movement, original: before, candidate: after,
        outcome: slot === 'E' ? 'original-total-budget-does-not-match-source-per-pulse-tier' : 'original-target-attached-dot-does-not-match-spatial-rehit',
        engineRegressionEstablished: false, candidateFullSlotGold: false });
    }
  }
}
checkPins();
fs.mkdirSync(out, { recursive: true });
const put = (name: string, v: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
put('cases.json', results); put('candidate-projects.private.json', candidates);
const manifest = { schema: 'ggd-hero12b-behavior-probes@1', generatedAt: new Date().toISOString(),
  engineManifest: 'current-engine-v1/manifest.json', scriptSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  compiledSourceSha256: hash(fs.readFileSync(path.join(here, 'current-engine-v1/compiled-references.private.json'))),
  counts: { suspectSlots: 4, pairedScenarios: results.length, simulatorRuns: results.length * 2, seeds: 2 },
  casesSha256: hash(JSON.stringify(results)), candidatesSha256: hash(JSON.stringify(candidates)),
  sourceOriginalsModified: false, engineModified: false, gpuCalls: 0, trainingAdmitted: 0, releaseQualified: false,
  limits: ['Purpose-built boundary probes, not whole-hero validation.', 'E proposed correction preserves explicitly requested per-pulse tier.',
    'R proposed corrections demonstrate current spatial capability; geometry and timing proposals still need source adjudication.',
    'No claim of product regression: existing random-barrage implementation explicitly documents its target-attached approximation.'] };
put('manifest.json', manifest);
console.log(JSON.stringify({ ...manifest, summary: results.map(r => ({ id: r.id, slot: r.slot, seed: r.seed, movement: r.movement,
  beforeHits: r.original.hits.length, afterHits: r.candidate.hits.length,
  firstBefore: r.original.hits[0]?.data.amount, firstAfter: r.candidate.hits[0]?.data.amount })) }, null, 2));
