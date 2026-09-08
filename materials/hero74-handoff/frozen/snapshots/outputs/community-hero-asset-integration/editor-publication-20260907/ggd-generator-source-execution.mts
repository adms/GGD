import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { snapshotHeroGenerator, snapshotHeroProcessor } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/import/heroBuildSources.ts';
import { generateHeroDraft, compileGeneratedHeroDraft } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/heroForge/generator.ts';
import { heroPackageProject, shippedHeroCatalog } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import { retainHeroBuildSources } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/content-api/src/heroBuildHistory.ts';
import { ImportStore } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/content-api/src/importStore.ts';
const repo = '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge';
const root = mkdtempSync('/private/tmp/ggd-source-execution-');
const historyDir = join(repo, '../outputs/community-hero-asset-integration/editor-publication-20260907/generator-source-history');
retainHeroBuildSources(repo, new ImportStore({dir:historyDir}), snapshotHeroProcessor(repo).processorFingerprint);
const history = new ImportStore({dir:historyDir});
const catalog = shippedHeroCatalog(), project = heroPackageProject(catalog);
const options = { heroId: project.projectId, heroName: project.brief.name, modelKey: project.presentation.modelKey, presentation: project.presentation };
const templates = [...catalog.documents].filter(([key]) => key.startsWith('ability-templates/')).map(([, doc]) => doc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith('config/')).map(([, doc]) => doc);
const generated = generateHeroDraft(project.acceptedPlan!, options);
const expected = JSON.parse(JSON.stringify({ generated, compiled: compileGeneratedHeroDraft(generated, templates as any, configs) }));
assert.equal(expected.compiled.ok, true);
const proofs = [];
for (const snapshot of [snapshotHeroGenerator(repo), snapshotHeroProcessor(repo)]) {
  const target = join(root, snapshot.kind);
  const archivedFiles=history.readWorkFiles(`ggd-${snapshot.kind}-source`,snapshot.versionId)!;
  assert(archivedFiles);
  for (const [path, bytes] of archivedFiles) if (path.startsWith('source/')) {
    const file = join(target, path.slice(7)); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
  }
  symlinkSync(join(repo, 'node_modules'), join(target, 'node_modules'), 'dir');
  symlinkSync(join(repo, 'packages/shared/node_modules'), join(target, 'packages/shared/node_modules'), 'dir');
  writeFileSync(join(target, 'input.json'), JSON.stringify({ plan: project.acceptedPlan, options, templates, configs }));
  writeFileSync(join(target, 'guard.mjs'), `import { register } from 'node:module'; register('./guard-loader.mjs', import.meta.url);`);
  writeFileSync(join(target, 'guard-loader.mjs'), `import { appendFileSync } from 'node:fs';
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (result.url.startsWith(${JSON.stringify(pathToFileURL(repo + '/').href)}) && !result.url.includes('/node_modules/')) throw Error('original workspace source imported: ' + result.url);
  if (result.url.startsWith(${JSON.stringify(pathToFileURL(target + '/').href)}) && result.url.includes('/packages/shared/src/')) appendFileSync(${JSON.stringify(join(target, 'loaded-sources.txt'))}, result.url + '\\n');
  return result;
}`);
  writeFileSync(join(target, 'run.mts'), `import { readFileSync, writeFileSync } from 'node:fs';
import { generateHeroDraft, compileGeneratedHeroDraft } from './packages/shared/src/content/heroForge/generator.ts';
const input = JSON.parse(readFileSync('input.json', 'utf8'));
const generated = generateHeroDraft(input.plan, input.options);
writeFileSync('output.json', JSON.stringify({generated, compiled: compileGeneratedHeroDraft(generated, input.templates, input.configs)}));`);
  execFileSync(process.execPath, ['--import', 'tsx', '--import', './guard.mjs', 'run.mts'], { cwd: target, env: { ...process.env, TSX_TSCONFIG_PATH: join(target, 'tsconfig.base.json') }, stdio: 'pipe' });
  assert.deepEqual(JSON.parse(readFileSync(join(target, 'output.json'), 'utf8')), expected);
  const loaded = [...new Set(readFileSync(join(target, 'loaded-sources.txt'), 'utf8').trim().split('\n'))];
  assert(loaded.some(path => path.endsWith('/content/heroForge/generator.ts')));
  proofs.push({ kind: snapshot.kind, versionId: snapshot.versionId, capturedFiles: snapshot.files.size, sourceBytes: [...snapshot.files.values()].reduce((n, b) => n + b.length, 0), loadedSourceModules: loaded.length, outputIdentical: true, originalWorkspaceSourceImportsRejected: true, target });
}
const proof = { schema: 'ggd-generator-source-execution-proof@1', historyDir, proofs, limitation: 'Executed archived source with the existing local Node and installed dependencies. This is not a clean dependency installation or whole-game historical rebuild.' };
writeFileSync('/private/tmp/ggd-generator-source-execution-proof.json', JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof));
