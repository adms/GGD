import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPolicy, defaultEligible, selectionSource, selectionRank } from './default-policy.mts';
import { MODEL_SELECTION_ORDER, modelSelectionClass, preferredModelVersion, sortModelVersions, type ChampionModelVersion } from '../../packages/shared/src/content/schema/championModelVersions';
const manifest = JSON.parse(readFileSync(new URL('../../materials/hero-model-library/manifest.json', import.meta.url), 'utf8'));
test('only the eleven approved exact hero/copy pairs become proxy defaults', () => {
  assert.equal(defaultPolicy.approvedDerivatives.length, 11);
  for (const a of defaultPolicy.approvedDerivatives) {
    const hero = manifest.heroes.find((h:any) => h.id === a.heroId);
    const option = hero.options.find((o:any) => o.sourceId === a.sourceId);
    const model = manifest.models.find((m:any) => m.id === a.sourceId);
    assert.equal(model.sha256, a.sha256);
    assert.ok(defaultEligible(a.heroId, option));
    assert.equal(defaultEligible('different-hero', option), false);
    assert.equal(defaultEligible(a.heroId, {...option, sourceModelKey:'different-copy'}), false);
  }
});
test('unapproved 300 proxies remain candidates, while identity matches remain eligible', () => {
  const rejected = manifest.heroes.flatMap((h:any) => h.options.filter((o:any) => o.source.kind === 'style-proxy' && !defaultEligible(h.id,o)));
  assert.ok(rejected.length > 0);
  for (const h of manifest.heroes) for (const o of h.options) if (o.source.kind === 'exact') assert.ok(defaultEligible(h.id,o));
});
test('owner order is shared; direct original-game evidence never comes from identity alone', () => {
  assert.deepEqual(defaultPolicy.priority, [...MODEL_SELECTION_ORDER]);
  const source = {kind:'exact' as const, character:'hero', work:'work', library:'300heroes', tier:'300heroes' as const, reference:'evidence'};
  assert.equal(modelSelectionClass(source), '300heroes');
  const versions = MODEL_SELECTION_ORDER.map((selectionClass, i) => ({
    modelKey:`version.body.${i}`, sourceModelKey:`body.${i}`, label:selectionClass,
    modelSha256:'a'.repeat(64), binarySha256:'b'.repeat(64), registeredAt:'2026-09-10T00:00:00Z',
    source:{...source, selectionClass}, automaticEligible:true,
  } satisfies ChampionModelVersion));
  for (let rank=0; rank<versions.length; rank++) {
    const candidates = versions.slice(rank).reverse();
    assert.equal(preferredModelVersion(candidates)?.modelKey, versions[rank].modelKey);
    assert.equal(sortModelVersions(candidates).length, candidates.length);
  }
  const ineligible = {...versions[0], automaticEligible:false};
  assert.equal(preferredModelVersion([versions[5], ineligible])?.modelKey, versions[5].modelKey);
  assert.equal(sortModelVersions([versions[5], ineligible]).length, 2);
  for (const approval of defaultPolicy.approvedDerivatives) {
    const option = manifest.heroes.find((h:any)=>h.id===approval.heroId).options.find((o:any)=>o.sourceId===approval.sourceId);
    assert.equal(selectionRank(approval.heroId,option), 0);
    assert.equal(selectionSource(approval.heroId,option).tier, option.source.tier);
  }
});
