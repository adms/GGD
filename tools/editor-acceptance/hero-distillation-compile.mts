import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {materializeTarget, modelMetadata} from './hero-distillation-adapter.mjs';

const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const jsonHash = (value: unknown) => hash(JSON.stringify(value));
const script = fileURLToPath(import.meta.url);
const deliveryRepo = path.resolve(path.dirname(script), '../..');
const args = process.argv.slice(2);
const options: Record<string, string> = {};
while (args.length) {
  const key = args.shift()!;
  assert(['--pairs', '--source-repo', '--out', '--projection'].includes(key) && args.length, 'USAGE: --pairs DIR --source-repo REPO --out NEW_DIR [--projection verify]');
  assert(!options[key], 'DUPLICATE_ARGUMENT'); options[key] = args.shift()!;
}
for (const key of ['--pairs', '--source-repo', '--out']) assert(options[key], 'MISSING:' + key);
const pairs = path.resolve(options['--pairs']), repo = path.resolve(options['--source-repo']), out = path.resolve(options['--out']);
assert(!fs.existsSync(out), 'OUTPUT_ALREADY_EXISTS');
const manifest = JSON.parse(fs.readFileSync(path.join(pairs, 'manifest.json'), 'utf8'));
function readPairs(name: string) {
  const bytes = fs.readFileSync(path.join(pairs, name));
  assert.equal(hash(bytes), manifest.outputs[name], 'PAIR_INPUT_DRIFT:' + name);
  return JSON.parse(bytes.toString());
}
const heroes = readPairs('heroes.json'), artifacts = readPairs('artifacts.json'), examples = readPairs('examples.json');
assert(options['--projection'] === undefined || options['--projection'] === 'verify', 'PROJECTION_MODE');
const verifyProjection = options['--projection'] === 'verify';
const models: Record<string, any> = {};
for (const hero of heroes.filter((h: any) => h.family === 'community37')) {
  const p = artifacts[hero.id].presentation, metadata = modelMetadata(p);
  if (Object.hasOwn(models, p.modelKey)) assert.deepEqual(models[p.modelKey], metadata, 'MODEL_METADATA_CONFLICT');
  models[p.modelKey] = metadata;
}
const snapshots = fs.mkdtempSync(path.join(os.tmpdir(), 'ggd-distillation-engines-'));
const engines: Record<string, any> = {};
const engineEvidence: Record<string, any> = {};

function jsonDocs(root: string): any[] {
  return fs.readdirSync(root).filter(name => name.endsWith('.json') && name !== '_index.json').sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')));
}
function walkKinds(value: any, found = new Set<string>()) {
  if (value && typeof value === 'object') {
    if (typeof value.kind === 'string') found.add(value.kind);
    for (const child of Object.values(value)) walkKinds(child, found);
  }
  return [...found].sort();
}
function diagnostics(error: any) {
  if (error?.issues) return error.issues.map((issue: any) => ({path: issue.path.join('.'), code: issue.code, message: issue.message}));
  return [{message: String(error)}];
}

async function engine(revision: string) {
  if (engines[revision]) return engines[revision];
  assert(/^[a-f0-9]{40}$/.test(revision), 'EXACT_ENGINE_REVISION_REQUIRED');
  const root = path.join(snapshots, revision); fs.mkdirSync(root);
  const archive = execFileSync('git', ['archive', '--format=tar', revision,
    'package.json', 'packages/shared/package.json', 'packages/shared/src',
    'content/config', 'content/ability-templates', 'content/vfx-subtypes'], {cwd: repo, maxBuffer: 128 * 1024 * 1024});
  execFileSync('tar', ['-xf', '-', '-C', root], {input: archive});
  fs.symlinkSync(path.join(deliveryRepo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  // pnpm keeps shared's runtime dependencies in the package-local directory.
  const sharedDependencies = path.join(deliveryRepo, 'packages/shared/node_modules');
  assert(fs.existsSync(path.join(sharedDependencies, 'zod/package.json')), 'SHARED_DEPENDENCIES_MISSING');
  fs.symlinkSync(sharedDependencies, path.join(root, 'packages/shared/node_modules'), 'dir');
  const load = (relative: string) => import(pathToFileURL(path.join(root, 'packages/shared/src/content', relative)).href);
  const hasTemplateVersions = fs.existsSync(path.join(root, 'packages/shared/src/content/heroForge/templateVersions.ts'));
  const [project, ability, champion, generator, runtime, templatesModule, presentation, templateVersions] = await Promise.all([
    load('heroForge/schema.ts'), load('schema/ability.ts'), load('schema/champion.ts'),
    load('heroForge/generator.ts'), load('runtimeResolver.ts'), load('templates/resolve.ts'),
    load('heroForge/presentation.ts'), hasTemplateVersions ? load('heroForge/templateVersions.ts') : Promise.resolve(null),
  ]);
  const templates = jsonDocs(path.join(root, 'content/ability-templates'));
  const configs = jsonDocs(path.join(root, 'content/config'));
  const subtypes = jsonDocs(path.join(root, 'content/vfx-subtypes'));
  const templateMap = new Map(templates.map(t => [t.id, t]));
  const loaded = {project, ability, champion, generator, runtime: runtime.createRuntimeResolver(templateMap, configs),
    resolveTemplateExpansion: templatesModule.resolveTemplateExpansion, templates, templateMap, configs, subtypes,
    presentation, templateVersions};
  engines[revision] = loaded;
  engineEvidence[revision] = {revision, temporaryRoot: root, archiveSha256: hash(archive), archiveBytes: archive.length,
    runtimeDependencies: {zod: JSON.parse(fs.readFileSync(path.join(sharedDependencies, 'zod/package.json'), 'utf8')).version},
    templates: templates.length, configs: configs.length, vfxSubtypes: subtypes.length,
    sourceFiles: Object.fromEntries(['heroForge/schema.ts', 'heroForge/generator.ts', 'heroForge/presentation.ts', 'heroForge/templateVersions.ts', 'schema/ability.ts', 'schema/champion.ts', 'runtimeResolver.ts', 'templates/resolve.ts']
      .filter(f => fs.existsSync(path.join(root, 'packages/shared/src/content', f)))
      .map(f => [f, hash(fs.readFileSync(path.join(root, 'packages/shared/src/content', f)))]))};
  return loaded;
}

const rows: any[] = [], compiled: Record<string, any> = {}, projected: Record<string, any> = {};
for (const hero of heroes) {
  const e = await engine(hero.provenance.gameRevision);
  const raw = artifacts[hero.id];
  assert.equal(jsonHash(raw), hero.teacherSha256, 'TEACHER_HASH_DRIFT:' + hero.id);
  const row: any = {heroId: hero.id, family: hero.family, teacherSha256: hero.teacherSha256,
    engineRevision: hero.provenance.gameRevision, schema: {ok: false, issues: []}, slots: {},
    compileOk: false, fullHeroPlayable: false, semanticQualified: false, trainingAdmitted: false};
  if (hero.family === 'community37') {
    const parsed = e.project.zHeroProject.safeParse(raw);
    row.schema = parsed.success ? {ok: true, issues: []} : {ok: false, issues: diagnostics(parsed.error)};
    if (parsed.success) {
      try {
        const project = parsed.data;
        const generated = e.generator.generateHeroDraft(project.acceptedPlan, {
          heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation,
        });
        const result = e.generator.compileGeneratedHeroDraft(generated, e.templates, e.configs, e.subtypes);
        row.compileOk = result.ok;
        if (result.ok) {
          compiled[hero.id] = result.draft;
          for (const slot of SLOTS) row.slots[slot] = {schemaOk: true, compileOk: true,
            compiledSha256: jsonHash(result.draft.abilityDrafts[slot]), kinds: walkKinds(result.draft.abilityDrafts[slot])};
        } else {
          row.compileFailures = result.failures;
          for (const slot of SLOTS) row.slots[slot] = {schemaOk: true, compileOk: false,
            status: result.failures.some((f: any) => f.slot === slot) ? 'failed' : 'not-individually-certified',
            failures: result.failures.filter((f: any) => f.slot === slot)};
        }
      } catch (error) { row.compileFailures = diagnostics(error); }
    }
  } else {
    const parsed = e.champion.zChampionDoc.safeParse(raw.champion);
    row.schema = parsed.success ? {ok: true, issues: []} : {ok: false, issues: diagnostics(parsed.error)};
    const abilities: Record<string, any> = {};
    for (const slot of SLOTS) {
      const source = raw.abilities[slot];
      const parsedAbility = e.ability.zAbilityDoc.safeParse(source);
      const sr: any = {schemaOk: parsedAbility.success, compileOk: false};
      row.slots[slot] = sr;
      if (!parsedAbility.success) { sr.issues = diagnostics(parsedAbility.error); continue; }
      try {
        // Native effects/passives are valid without any template binding.
        // The template resolver is not a generic entry point for all abilities.
        let authoredInput = parsedAbility.data;
        if (authoredInput.template !== undefined) {
          const expanded = e.resolveTemplateExpansion(authoredInput, e.templateMap);
          if (!expanded.ok) { sr.failures = [expanded.failure]; continue; }
          authoredInput = expanded.merged;
        }
        const authored = e.ability.zAbilityDoc.safeParse(authoredInput);
        if (!authored.success) { sr.failures = diagnostics(authored.error); continue; }
        const resolved = e.runtime.resolve(authored.data);
        abilities[slot] = resolved;
        sr.compileOk = true; sr.compiledSha256 = jsonHash(resolved); sr.kinds = walkKinds(resolved);
      } catch (error) { sr.failures = diagnostics(error); }
    }
    row.compileOk = row.schema.ok && SLOTS.every(slot => row.slots[slot].compileOk);
    compiled[hero.id] = {champion: raw.champion, abilityDrafts: abilities};
  }
  if (verifyProjection && row.compileOk) {
    const check: any = {materialized: false, schemaCompileOk: false, gameplayPreserved: false, jsonRoundtripIdentical: false};
    row.projection = check;
    try {
      const context = {heroId: hero.id, heroName: hero.request.heroName};
      const output = materializeTarget(hero.target, context, e, models);
      projected[hero.id] = output;
      check.materialized = true;
      assert.deepEqual(output, JSON.parse(JSON.stringify(output)), 'JSON_ROUNDTRIP_CHANGED');
      check.jsonRoundtripIdentical = true;
      if (output.format === 'hero-project') {
        const project = output.project;
        const result = e.generator.compileGeneratedHeroDraft(e.generator.generateHeroDraft(project.acceptedPlan,
          {heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation}), e.templates, e.configs, e.subtypes);
        assert(result.ok, 'PROJECTED_COMPILE_FAILED:' + JSON.stringify(result.failures));
        check.schemaCompileOk = true;
        // Only pure presentation scripts may change (visual defaults instead
        // of teacher art tuning). Every other compiled field must stay equal.
        const {vfxScripts: beforeScripts, ...before} = compiled[hero.id];
        const {vfxScripts: afterScripts, ...after} = result.draft;
        assert.deepEqual(after, before, 'COMPILED_GAMEPLAY_OR_BINDING_CHANGED');
        check.gameplayPreserved = true;
        check.visualScriptCount = afterScripts.length;
        check.visualFineTuningReplacedByEngineDefaults = true;
      } else {
        for (const slot of SLOTS) {
          let authored = output.abilities[slot];
          if (authored.template !== undefined) {
            const expanded = e.resolveTemplateExpansion(authored, e.templateMap);
            assert(expanded.ok, 'NATIVE_PROJECTION_TEMPLATE_FAILURE');
            authored = expanded.merged;
          }
          const resolved = e.runtime.resolve(e.ability.zAbilityDoc.parse(authored));
          assert.deepEqual(resolved, compiled[hero.id].abilityDrafts[slot], 'NATIVE_GAMEPLAY_CHANGED:' + slot);
        }
        const {abilities: oldMirrors, ...beforeChampion} = e.champion.zChampionDoc.parse(raw.champion);
        const {abilities: newMirrors, ...afterChampion} = output.champion;
        assert.deepEqual(afterChampion, beforeChampion, 'NATIVE_CHAMPION_CHANGED');
        check.schemaCompileOk = true; check.gameplayPreserved = true;
        check.authoritativeStandaloneMirrorsRebuilt = true;
      }
    } catch (error) { check.failures = diagnostics(error); }
  }
  rows.push(row);
  if (rows.length % 20 === 0) console.log(JSON.stringify({compiledHeroRecords: rows.length, total: heroes.length}));
}
const byId = new Map(rows.map(r => [r.heroId, r]));
const candidateChecks = examples.map((example: any) => {
  const row = byId.get(example.heroId);
  const structureOk = example.slot === 'HERO' ? row.compileOk : row.slots[example.slot]?.compileOk === true;
  return {id: example.id, heroId: example.heroId, slot: example.slot, pairingEligible: example.pairingEligible,
    schemaCompileOk: structureOk, remainingCandidate: example.pairingEligible && structureOk,
    trainingAdmitted: false, semanticQualified: false, fullHeroPlayable: false};
});
const count = (predicate: (r: any) => boolean) => candidateChecks.filter(predicate).length;
const report = {schema: 'ggd-distillation-teacher-compile@1', sourceRepo: repo,
  sourcePairManifestSha256: hash(fs.readFileSync(path.join(pairs, 'manifest.json'))),
  scriptSha256: hash(fs.readFileSync(script)), nodeVersion: process.version,
  engines: engineEvidence,
  counts: {heroRecords: heroes.length, heroSchemaPassed: rows.filter(r => r.schema.ok).length,
    fullTeacherCompilePassed: rows.filter(r => r.compileOk).length,
    remainingWholeHeroCandidates: count(r => r.remainingCandidate && r.slot === 'HERO'),
    remainingSlotCandidates: count(r => r.remainingCandidate && r.slot !== 'HERO'),
    sourcePairedButStructureFailed: count(r => r.pairingEligible && !r.schemaCompileOk),
    trainingAdmitted: 0, modelInferenceCalls: 0},
  scope: 'Original teacher schema + exact-version template expansion/runtime normalization. Not semantic source fidelity, asset closure, editor integration, or match E2E.',
  rows, candidateChecks};
if (verifyProjection) {
  Object.assign(report, {projection: {scriptSha256: hash(fs.readFileSync(path.join(path.dirname(script), 'hero-distillation-adapter.mjs'))),
    publicModelCount: Object.keys(models).length, publicModelsSha256: jsonHash(models),
    tested: rows.filter(r => r.projection).length,
    passed: rows.filter(r => r.projection?.gameplayPreserved).length,
    pairedWholeHeroPassed: examples.filter((x: any) => x.slot === 'HERO' && x.pairingEligible && byId.get(x.heroId).projection?.gameplayPreserved).length,
    teacherGameplayReadByMaterializer: false, editorSaveReloadPassed: false,
    assetIdentityRelationshipAsserted: false, matchE2EPassed: false}});
}
fs.mkdirSync(out, {recursive: true});
for (const [name, value] of Object.entries({report, compiled, ...(verifyProjection ? {projected, models} : {})})) fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({counts: report.counts, projection: (report as any).projection}));
