import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const { zAbilityDoc } = await import('../../packages/shared/src/content/schema/ability.ts');
const { resolveTemplateExpansion } = await import('../../packages/shared/src/content/templates/resolve.ts');
const { createRuntimeResolver } = await import('../../packages/shared/src/content/runtimeResolver.ts');
const { heroTemplateInstance } = await import('../../packages/shared/src/content/heroForge/templateVersions.ts');
const { contentSha256 } = await import('../../packages/shared/src/content/import/jcs.ts');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => sha(JSON.stringify(value));
const json = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const docs = dir => fs.readdirSync(path.join(root, dir))
  .filter(name => name.endsWith('.json') && name !== '_index.json')
  .map(name => json(`${dir}/${name}`));
const fixturePath = 'docs/_reports/community-teacher-mechanism-corrections/fixtures.json';

export function gameplay(ability) {
  return Object.fromEntries(Object.entries(ability)
    .filter(([key]) => !['name', 'description', 'icon', 'template'].includes(key)));
}

// A deliberately narrow detector for the six frozen negative examples.
// It is NOT a universal natural-language judge or a corrected-recipe release gate.
export function matchesKnownGap(ability, family) {
  if (family === 'resource-state') {
    const ranks = ability.passive?.ranks;
    const hook = ranks?.[0]?.hooks?.[0];
    return ability.effects.length === 0 && ranks?.length === 1
      && ranks[0].hooks.length === 1 && hook.on === 'onBasicAttack'
      && hook.effects.length === 1 && hook.effects[0].kind === 'damage'
      && hook.internalCooldown === 3 && hook.condition?.kind === 'chance'
      && hook.condition.p === 1 && !ability.marks?.length && !ability.statusCost;
  }
  if (family === 'ally-shield') {
    const [buff, shield] = ability.effects;
    return ability.castType === 'self' && ability.effects.length === 2
      && buff.kind === 'applyBuff' && buff.modifiers.length === 0 && !buff.hooks?.length
      && shield.kind === 'shield' && shield.applyTo !== 'target'
      && !ability.marks?.length && !ability.statusCost;
  }
  throw new Error(`UNKNOWN_FAMILY:${family}`);
}

export function reproduce(family) {
  assert(family === undefined || ['resource-state', 'ally-shield'].includes(family), 'BAD_FAMILY');
  const fixture = json(fixturePath);
  const templates = new Map(docs('content/ability-templates').map(t => [t.id, t]));
  const configs = docs('content/config');
  const selected = fixture.cases.filter(row => family === undefined || row.family === family);
  assert.equal(selected.length, family ? 3 : 6, 'FIXTURE_CASES_CHANGED');
  const results = [];
  for (const row of selected) {
    const recipeBytes = fs.readFileSync(path.join(root, row.recipePath));
    assert.equal(sha(recipeBytes), row.recipeSha256,
      `SOURCE_VERSION_CHANGED: re-review the new recipe; do not relabel it using the old verdict: ${row.id}`);
    const recipe = JSON.parse(recipeBytes);
    const slot = recipe.slots.find(s => s.slot === row.slot);
    assert.equal(slot.ownerDescription, row.sourceRequest.description);
    assert.equal(slot.name, row.sourceRequest.name);
    assert.equal(slot.template.ref, row.template.ref);
    assert.deepEqual(slot.template.params, row.template.params);
    for (const [key, value] of Object.entries(slot.abilityOverrides)) {
      assert.deepEqual(row.authoredAbility[key], value, `OVERRIDE_DRIFT:${row.id}:${key}`);
    }
    // HeroProject deliberately pins its own template version. The current
    // catalog's buff-self has since gained fields; that does not rewrite an
    // already saved teacher. Reproduce its actual saved version, never rebind.
    const sourceTemplate = fixture.templateVersions[row.template.contentSha256];
    assert(sourceTemplate, `MISSING_TEMPLATE:${row.template.ref}`);
    assert.equal(contentSha256(sourceTemplate), row.template.contentSha256, 'TEMPLATE_VERSION_CHANGED');
    const instance = heroTemplateInstance(row.template.contentSha256, sourceTemplate);
    const catalog = new Map(templates).set(instance.id, instance);
    const authored = zAbilityDoc.parse(row.authoredAbility);
    const expansion = resolveTemplateExpansion(authored, catalog);
    assert(expansion.ok, `TEMPLATE_EXPANSION_FAILED:${row.id}:${JSON.stringify(expansion.failure)}`);
    const compiled = createRuntimeResolver(catalog, configs).resolve(zAbilityDoc.parse(expansion.merged));
    // Includes every executable field; exact equality with the earlier full
    // HeroProject compiler prevents this slot-only reproducer from silently
    // manufacturing a different bug. Cosmetic fields/template mirrors excluded.
    assert.equal(hash(gameplay(compiled)), row.originalCompiledGameplaySha256, `COMPILED_GAMEPLAY_DRIFT:${row.id}`);
    assert(matchesKnownGap(compiled, row.family), `KNOWN_GAP_NOT_REPRODUCED:${row.id}`);
    results.push({ id: row.id, heroName: row.heroName, family: row.family,
      source: row.sourceRequest.description, castType: compiled.castType,
      activeEffectKinds: compiled.effects.map(effect => effect.kind),
      passiveHooks: (compiled.passive?.ranks ?? []).flatMap(rank => rank.hooks ?? [])
        .map(hook => ({ on: hook.on, kinds: hook.effects.map(effect => effect.kind), internalCooldown: hook.internalCooldown })),
      compiledGameplaySha256: hash(gameplay(compiled)), reproduced: true, runtimeTested: false,
      compiled });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length <= 3, 'USAGE: node tools/editor-acceptance/community-teacher-mechanism-repro.mjs [resource-state|ally-shield]');
  const results = reproduce(process.argv[2]).map(({ compiled, ...row }) => row);
  console.log(JSON.stringify({ scope: 'Exact teacher recipe -> template expansion -> schema -> runtime normalization. No gameplay simulation or complete-hero certification.', results }, null, 2));
}
