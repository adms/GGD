import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shippedHeroCatalog } from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/communityExamples.ts';
import { refineAzazelProject } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/communityRefinements/azazel.ts';
import { compileHeroPackageProject } from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import { buildCapabilityManifest } from '../../GGD-community-hero-forge/packages/shared/src/content/editorCapabilities.ts';
import { zHeroProject } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import { zTemplateDoc, type TemplateDoc } from '../../GGD-community-hero-forge/packages/shared/src/content/schema/template.ts';
import { defaultHeroPresentation } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/presentation.ts';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const repo = path.join(root, 'GGD-community-hero-forge');
assert.equal(process.argv.length, 3, 'USAGE: tsx current-snapshot.mts NEW_OUTPUT_DIRECTORY');
const out = path.resolve(process.argv[2]);
assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const hash = (v: string | Buffer) => crypto.createHash('sha256').update(v).digest('hex');
const jsonHash = (v: unknown) => hash(JSON.stringify(v));
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const codeFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? codeFiles(p) : d.isFile() && /\.(?:ts|json)$/.test(d.name) ? [p] : [];
}).sort();
// Pin all shared implementation/test code, plus every catalog document actually loaded.
const sourceFiles = [...codeFiles(path.join(repo, 'packages/shared/src')), ...codeFiles(path.join(repo, 'packages/shared/testkit')),
  path.join(repo, 'pnpm-lock.yaml'), path.join(repo, 'package.json'), path.join(repo, 'vitest.config.ts')];
const sourcePins = sourceFiles.map(p => ({ path: path.relative(root, p), sha256: hash(fs.readFileSync(p)) }));
const head = git('rev-parse', 'HEAD');
const catalog = shippedHeroCatalog();
const catalogPins = [...catalog.documents].map(([key, doc]) => ({ key, sha256: jsonHash(doc) })).sort((a, b) => a.key.localeCompare(b.key));
const templates = [...catalog.documents].filter(([key]) => key.startsWith('ability-templates/')).map(([, doc]) => zTemplateDoc.parse(doc));
const capabilities = buildCapabilityManifest();
const oldSeven = JSON.parse(fs.readFileSync(path.join(root, 'outputs/forge-final-three-hours-20260906/seven-heroes-source-v1/heroes.json'), 'utf8'));
const rows: unknown[] = [];
for (const recipe of COMMUNITY_HERO_EXAMPLES) {
  const old = oldSeven.find((h: { id: string }) => h.id === recipe.id);
  assert(old, 'MISSING_PRIOR_SOURCE');
  assert.deepEqual(JSON.parse(JSON.stringify(recipe)), old.recipe, 'HERO_RECIPE_CHANGED_SINCE_SOURCE_INTAKE');
  const project = createCommunityHeroExample(recipe.id, `research12b-reference-${recipe.id}`, templates);
  const compiled = compileHeroPackageProject(project, catalog, false);
  rows.push({ id: `community7-${recipe.id}`, sourceText: old.sourceText, sourceSha256: hash(old.sourceText),
    referenceOnly: true, wholeHeroSemanticsAdmitted: false, recipe, project,
    compiled: compiled.compiled, runtimeDocuments: compiled.runtime.length,
    dependencyCount: compiled.dependencies.length, simulationPerformedByThisSnapshot: false });
}
const azazelInputPath = path.join(repo, 'packages/shared/testkit/fixtures/azazel-handoff.json');
const azazelInput = zHeroProject.parse(JSON.parse(fs.readFileSync(azazelInputPath, 'utf8')));
const refined = refineAzazelProject(azazelInput);
assert.deepEqual(refined.sourceDesign, azazelInput.sourceDesign, 'SOURCE_DESIGN_MUTATED');
// This is a mechanics-only probe copy; original and generated presentations are retained as evidence.
const probeProject = zHeroProject.parse({ ...structuredClone(refined), presentation: defaultHeroPresentation() });
const azazel = compileHeroPackageProject(probeProject, catalog, false);
rows.push({ id: 'community37-32', sourceText: refined.sourceDesign!.ownerText,
  sourceSha256: hash(refined.sourceDesign!.ownerText), sourceDesign: refined.sourceDesign,
  referenceOnly: true, wholeHeroSemanticsAdmitted: false,
  originalPresentationPreserved: true, probePresentation: 'default fixture only; not an asset acceptance',
  project: refined, compiled: azazel.compiled, runtimeDocuments: azazel.runtime.length,
  dependencyCount: azazel.dependencies.length, simulationPerformedByThisSnapshot: false });
for (const p of sourcePins) assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, 'CODE_CHANGED_DURING_SNAPSHOT');
assert.deepEqual([...shippedHeroCatalog().documents].map(([key, doc]) => ({ key, sha256: jsonHash(doc) })).sort((a, b) => a.key.localeCompare(b.key)), catalogPins, 'CATALOG_CHANGED_DURING_SNAPSHOT');
assert.equal(git('rev-parse', 'HEAD'), head, 'HEAD_CHANGED_DURING_SNAPSHOT');
fs.mkdirSync(out, { recursive: true });
const put = (name: string, value: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
put('capabilities.json', capabilities); put('templates.json', templates);
put('compiled-references.private.json', rows);
put('catalog-pins.json', catalogPins); put('source-pins.json', sourcePins);
const manifest = { schema: 'ggd-hero12b-current-engine-snapshot@1', createdAt: new Date().toISOString(),
  repo: 'GGD-community-hero-forge', head, branch: git('branch', '--show-current'),
  dirtyStatus: git('status', '--short', '--untracked-files=all'), generatorSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  sourceCodeFiles: sourcePins.length, sourcePinsSha256: jsonHash(sourcePins), catalogDocuments: catalogPins.length, catalogPinsSha256: jsonHash(catalogPins),
  counts: { heroesCompiled: rows.length, slotsCompiled: rows.length * 6, templates: templates.length,
    enabledTemplates: templates.filter(t => t.status === 'enabled').length, effectKinds: capabilities.effectKinds.length,
    hookEvents: capabilities.hookEvents.length, conditionLeafKinds: capabilities.conditionLeafKinds.length },
  capabilityFingerprint: capabilities.fingerprint, sourceRecipeUnchanged: true,
  noOriginalFilesWritten: true, modelCalls: 0, simulationPerformedByThisSnapshot: false,
  semanticsQualified: false, releaseQualified: false,
  limitations: ['Template/schema support is not whole-mechanism equivalence.',
    'These eight reference projects are not model-generated output.',
    'All catalog digests use JSON.stringify SHA256 here; not interchangeable with the engine JCS digest.',
    'Azazel mechanics probe uses default fixture presentation; no new visual/model acceptance.'],
};
put('manifest.json', manifest);
console.log(JSON.stringify(manifest, null, 2));
