import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPolicy, defaultEligible } from './default-policy.mts';
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
