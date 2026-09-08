import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeTarget, modelMetadata} from './hero-distillation-adapter.mjs';

// Run the compiler's --projection verify first. It extracts exact source
// revisions and records these temporary paths; a new run restores them on a
// different machine. No mutable checkout is silently substituted for them.
const reportPath = path.resolve(process.env.DISTILLATION_PROJECTION_REPORT ??
  'docs/_reports/hero-finetune-research/distillation-indexed-v1/projection-verified/report.json');
const base = path.dirname(reportPath);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const pairs = path.resolve(base, '../../distillation-pairs-v1');
const heroes = JSON.parse(fs.readFileSync(path.join(pairs, 'heroes.json'), 'utf8'));
const artifacts = JSON.parse(fs.readFileSync(path.join(pairs, 'artifacts.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(base, 'models.json'), 'utf8'));
const engines: Record<string, any> = {};
for (const [revision, evidence] of Object.entries(report.engines) as [string, any][]) {
  const root = evidence.temporaryRoot;
  for (const [relative, sha] of Object.entries(evidence.sourceFiles)) {
    const bytes = fs.readFileSync(path.join(root, 'packages/shared/src/content', relative));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, 'PINNED_ENGINE_DRIFT');
  }
  const load = (relative: string) => import(pathToFileURL(path.join(root, 'packages/shared/src/content', relative)).href);
  const [project, ability, champion, presentation, templateVersions] = await Promise.all([
    load('heroForge/schema.ts'), load('schema/ability.ts'), load('schema/champion.ts'), load('heroForge/presentation.ts'),
    evidence.sourceFiles['heroForge/templateVersions.ts'] ? load('heroForge/templateVersions.ts') : null,
  ]);
  const templates = fs.readdirSync(path.join(root, 'content/ability-templates'))
    .filter(f => f.endsWith('.json') && f !== '_index.json').map(f => JSON.parse(fs.readFileSync(path.join(root, 'content/ability-templates', f), 'utf8')));
  engines[revision] = {project, ability, champion, presentation, templateVersions, templates};
}
const community = heroes.find((h: any) => h.family === 'community37');
const native = heroes.find((h: any) => h.family === 'adopted-catalog');
const context = (hero: any) => ({heroId: hero.id, heroName: hero.request.heroName});
function run(hero: any, mutate: (target: any) => void = () => {}, publicModels = models) {
  const target = structuredClone(hero.target); mutate(target);
  return materializeTarget(target, context(hero), engines[hero.provenance.gameRevision], publicModels);
}

test('all 104 structurally complete teacher targets materialize without mutating them', () => {
  const before = JSON.stringify(heroes);
  const good = new Set(report.rows.filter((r: any) => r.compileOk).map((r: any) => r.heroId));
  assert.equal(good.size, 104);
  for (const h of heroes.filter((h: any) => good.has(h.id))) run(h);
  assert.equal(JSON.stringify(heroes), before);
});
test('saved JSON artifact reloads as the exact deterministic materialized output', () => {
  const saved = JSON.parse(fs.readFileSync(path.join(base, 'projected.json'), 'utf8'));
  assert.equal(Object.keys(saved).length, 104);
  for (const hero of heroes.filter((h: any) => Object.hasOwn(saved, h.id))) assert.deepEqual(saved[hero.id], run(hero));
});
test('model decisions survive, while project validation evidence starts empty', () => {
  const output = run(community, t => { t.plan.slots.Q.purpose = 'test model decision'; t.plan.slots.Q.tuning.cooldownSec = 123; });
  assert.equal(output.project.acceptedPlan.slots.Q.purpose, 'test model decision');
  assert.equal(output.project.acceptedPlan.slots.Q.tuning.cooldownSec, 123);
  assert.deepEqual(output.project.receipts, []);
  assert(Object.values(output.project.validationState).every((s: any) => s.status === 'idle'));
});
test('missing gameplay slots are rejected, never filled from teacher data', () => {
  assert.throws(() => run(community, t => { delete t.plan.slots.E; }));
  assert.throws(() => run(native, t => { delete t.abilities.EX; }), /SIX_ABILITIES_REQUIRED/);
});
test('wrong digest and missing template cannot silently use current defaults', () => {
  assert.throws(() => run(community, t => { t.plan.slots.Q.products[0].template.contentSha256 = 'sha256:' + '0'.repeat(64); }), /TEMPLATE_PIN_MISMATCH_OR_MISSING/);
  assert.throws(() => run(community, t => { t.plan.slots.Q.products[0].template.ref = 'does-not-exist'; }), /TEMPLATE_PIN_MISMATCH_OR_MISSING/);
});
test('model cannot provide trusted catalog versions or a fabricated generator receipt', () => {
  assert.throws(() => run(community, t => { t.plan.templateVersions = {}; }), /MODEL_MUST_NOT_SUPPLY_TRUSTED_VERSIONS/);
  assert.throws(() => run(community, t => { t.plan.generatorVersion = 'sha256:' + '0'.repeat(64); }), /MODEL_MUST_NOT_SUPPLY_TRUSTED_VERSIONS/);
});
test('unsupported visual kinds and bad triggers fail instead of disappearing', () => {
  assert.throws(() => run(community, t => { t.presentationSelection.slots.Q.scriptSelections.push({kind: 'modelFx', on: 'castStart'}); }), /UNSUPPORTED_PRESENTATION_SELECTION/);
  assert.throws(() => run(community, t => { t.presentationSelection.slots.Q.scriptSelections[0].on = 'unknownTrigger'; }));
  assert.throws(() => run(community, t => { t.presentationSelection.slots.Q.scriptSelections.push({kind: 'vfx', on: 'castEffect', at: 'bone', vfxId: 'fx.prim.arcane.pulse'}); }), /BONE_ATTACHMENT_PAIR_REQUIRED/);
});
test('unknown assets or catalogs containing gameplay answers are rejected', () => {
  assert.throws(() => run(community, t => { t.presentationSelection.modelKey = 'unknown'; }), /MODEL_NOT_IN_PUBLIC_CATALOG/);
  const contaminated = structuredClone(models);
  contaminated[community.target.presentationSelection.modelKey].acceptedPlan = community.target.plan;
  assert.throws(() => run(community, () => {}, contaminated), /MODEL_CATALOG_CONTAINS_NON_ASSET_DATA/);
});
test('shared mesh metadata does not reuse per-hero exact/proxy judgements', () => {
  const p = artifacts[community.id].presentation;
  const different = structuredClone(p);
  different.modelProvenance.notes = 'different hero'; different.modelProvenance.relationship = 'style-proxy';
  assert.deepEqual(modelMetadata(p), modelMetadata(different));
  assert.equal(run(community).project.presentation.modelProvenance, undefined);
});
test('output identity and ability references cannot cross hero boundaries', () => {
  assert.throws(() => run(community, t => { t.plan.planId = 'other.plan'; }), /PLAN_ID_MISMATCH/);
  assert.throws(() => run(native, t => { t.abilities.Q.id = 'other.q'; }), /ABILITY_ID_MISMATCH/);
  assert.throws(() => run(native, t => { t.champion.passiveAbility = 'other.passive'; }), /PASSIVE_REFERENCE_MISMATCH/);
});
test('native authoritative slots rebuild mirrors and reject duplicate authorities', () => {
  const output = run(native);
  const {schema, ...q} = output.abilities.Q;
  assert.deepEqual(output.champion.abilities.Q, q);
  assert.throws(() => run(native, t => { t.champion.abilities = {}; }), /DUPLICATE_ABILITY_AUTHORITY/);
});
test('unknown mechanics are rejected by the actual pinned engine schema', () => {
  assert.throws(() => run(native, t => { t.abilities.Q.effects = [{kind: 'inventedEffect'}]; }));
  assert.throws(() => run(community, t => { t.plan.slots.Q.abilityOverrides.castType = 'self'; }));
});
test('materializer has no filesystem, network, process, or teacher-artifact API', () => {
  const source = fs.readFileSync(new URL('./hero-distillation-adapter.mjs', import.meta.url), 'utf8');
  assert(!/from ['"](?:node:)?(?:fs|child_process|http|https)['"]/.test(source));
  assert(!/\b(?:fetch|execFileSync|readFileSync)\s*\(/.test(source));
});
