/** Register one catalogued source option through ModelVersions without touching other heroes. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';
import { contentSha256 } from '../../packages/shared/src/content/import/jcs';
import { spliceMembers } from '../../packages/shared/src/content/editModel';
import { zModelVersionCommand } from '../../packages/shared/src/content/schema/championModelVersions';
import { defaultEligible, selectionSource } from './default-policy.mts';

const [heroId, sourceId] = process.argv.slice(2);
if (!heroId || !sourceId || process.argv.length !== 4) {
  throw new Error('Usage: node --import tsx tools/hero-model-library/register-one-source-option.mts <hero-id> <source-id>');
}

const root = resolve('content');
const library = resolve('materials/hero-model-library');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const manifests = [
  read(resolve(library, 'manifest.json')),
  read(resolve(library, 'workflow-model-options.json')),
  ...(existsSync(resolve(library, 'priority-runtime-options.json')) ? [read(resolve(library, 'priority-runtime-options.json'))] : []),
];
const aliases = read(resolve(library, 'workflow-model-options.json')).aliases ?? {};
const runtimeHeroId = aliases[heroId] ?? heroId;
const choices = manifests.flatMap((manifest: any) =>
  manifest.heroes.filter((hero: any) => hero.id === heroId).flatMap((hero: any) => hero.options),
);
const input = choices.find((option: any) => option.sourceId === sourceId);
if (!input) throw new Error(`No catalogued option ${heroId}/${sourceId}`);
if (choices.filter((option: any) => option.sourceId === sourceId).length !== 1) {
  throw new Error(`Ambiguous catalogued option ${heroId}/${sourceId}`);
}
const model = manifests.flatMap((manifest: any) => manifest.models)
  .find((candidate: any) => candidate.modelKey === input.sourceModelKey);
if (!model) throw new Error(`No catalogued model ${input.sourceModelKey}`);
for (const [path, digest] of [[model.glbPath, model.sha256], [`models/${model.modelKey}.json`, model.documentSha256]]) {
  const actual = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
  if (actual !== digest) throw new Error(`Delivery checksum mismatch: ${path}: ${actual} != ${digest}`);
}

const service = new ModelVersions(root);
const before = service.state(runtimeHeroId);
for (const version of before.versions) service.verify(version);
const option = { ...input, source: selectionSource(heroId, input) };
const automaticEligible = input.automaticEligible ?? defaultEligible(heroId, option);
const existing = before.versions.find((version: any) =>
  version.sourceModelKey === option.sourceModelKey
  && version.label === option.label
  && version.automaticEligible === automaticEligible
  && contentSha256(version.source) === contentSha256(option.source)
);
if (existing) {
  console.log(JSON.stringify({
    heroId, runtimeHeroId, sourceId, unchanged: true,
    beforeVersions: before.versions.length, afterVersions: before.versions.length,
    activeModelKey: before.activeModelKey, preferredModelKey: before.preferredModelKey,
    existing,
  }, null, 2));
  process.exit(0);
}
const prepared = await service.prepare(runtimeHeroId, zModelVersionCommand.parse({
  action: 'register',
  expectedHash: before.expectedHash,
  sourceModelKey: option.sourceModelKey,
  label: option.label,
  source: option.source,
  automaticEligible,
}));
service.assertCurrent(runtimeHeroId, before.expectedHash);
service.writeArtifacts(prepared.artifacts);
for (const artifact of prepared.artifacts) service.verify(artifact.version);

const championPath = resolve(root, 'champions', `${runtimeHeroId}.json`);
const raw = readFileSync(championPath, 'utf8');
const temporary = `${championPath}.${randomUUID()}.tmp`;
try {
  writeFileSync(temporary, spliceMembers(raw, {
    modelKey: prepared.champion.modelKey,
    modelVersions: prepared.champion.modelVersions,
    modelSelectionMode: prepared.champion.modelSelectionMode,
  }), { flag: 'wx' });
  service.assertCurrent(runtimeHeroId, before.expectedHash);
  renameSync(temporary, championPath);
} finally {
  if (existsSync(temporary)) unlinkSync(temporary);
}
const after = service.state(runtimeHeroId);
for (const version of after.versions) service.verify(version);
for (const version of before.versions) {
  if (!after.versions.some((candidate) => contentSha256(candidate) === contentSha256(version))) {
    throw new Error(`History lost: ${heroId}/${version.modelKey}`);
  }
}
if (before.selectionMode === 'manual' && after.activeModelKey !== before.activeModelKey) {
  throw new Error(`Manual selection changed: ${heroId}`);
}
console.log(JSON.stringify({
  heroId,
  runtimeHeroId,
  sourceId,
  beforeVersions: before.versions.length,
  afterVersions: after.versions.length,
  activeModelKey: after.activeModelKey,
  preferredModelKey: after.preferredModelKey,
  added: prepared.artifacts.map((artifact) => artifact.version),
}, null, 2));
