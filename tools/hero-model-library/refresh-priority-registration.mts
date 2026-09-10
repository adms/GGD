/** Refresh the readback after merging another workflow; never re-register or alter a model. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModelVersions } from '../../apps/content-api/src/modelVersions';

const path = resolve('materials/hero-model-library/priority-registration.json');
const previous = JSON.parse(readFileSync(path, 'utf8'));
if (previous.heroes.length !== 81 || new Set(previous.heroes.map((h: any) => h.runtimeHeroId)).size !== 81) {
  throw new Error('Expected the fixed 37 + 37 + 7 roster.');
}
const service = new ModelVersions(resolve('content'));
const heroes = previous.heroes.map((row: any) => {
  const after = service.state(row.runtimeHeroId);
  for (const version of after.versions) service.verify(version);
  for (const version of row.after.versions) {
    if (!after.versions.some(v => JSON.stringify(v) === JSON.stringify(version))) {
      throw new Error(`Prior version changed or disappeared: ${row.heroId}/${version.modelKey}`);
    }
  }
  if (after.activeModelKey !== row.after.activeModelKey || after.selectionMode !== row.after.selectionMode) {
    throw new Error(`Selection changed during merge: ${row.heroId}`);
  }
  if (after.selectionMode === 'automatic' && after.activeModelKey !== after.preferredModelKey) {
    throw new Error(`Automatic selection is stale: ${row.heroId}`);
  }
  return { ...row, before: row.after, after, status: 'merged-readback-verified' };
});
writeFileSync(path, JSON.stringify({ ...previous, heroes }, null, 2) + '\n');
console.log(JSON.stringify({ heroes: heroes.length, versionReferences: heroes.reduce((n: number, h: any) => n + h.after.versions.length, 0), selectionsPreserved: true }));
