import assert from 'node:assert/strict';

export const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
const SECTIONS = ['identity', 'attributes', 'skills', 'mechanics', 'presentation', 'validation', 'package'];
const clone = value => structuredClone(value);
const own = (value, key) => Object.hasOwn(value, key);

function exact(value, keys, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
}

/** Public asset metadata only. No hero plan, ability, teacher receipt, or
 * per-hero recommendation is accepted by the materializer. The caller builds
 * one shared catalog before generating any answers, never a target shortlist. */
export function modelMetadata(presentation) {
  const result = {};
  if (presentation.uploadedModel) result.uploadedModel = clone(presentation.uploadedModel);
  if (presentation.modelProvenance) result.source = Object.fromEntries(
    ['sourceAssetId', 'sourceCharacter', 'sourceWork'].map(key => [key, presentation.modelProvenance[key]]));
  result.assetLocks = clone((presentation.assetLocks ?? []).filter(lock => lock.kind === 'model'));
  return result;
}

function selectionSegments(segments) {
  assert(Array.isArray(segments), 'SCRIPT_SELECTIONS_REQUIRED');
  return segments.map(segment => {
    // This version intentionally handles only the selection kinds present in
    // this corpus. Reject unsupported kinds; never drop a requested binding.
    const fields = segment.kind === 'anim'
      ? ['kind', 'on', 'at', 'pulse', 'replaces']
      : segment.kind === 'vfx' ? ['kind', 'on', 'at', 'vfxId', 'attach', 'replaces'] : null;
    assert(fields, 'UNSUPPORTED_PRESENTATION_SELECTION:' + segment.kind);
    assert(Object.keys(segment).every(key => fields.includes(key)), 'UNSUPPORTED_PRESENTATION_FIELD');
    assert(segment.on, 'PRESENTATION_EVENT_REQUIRED');
    assert((segment.at === 'bone') === (segment.attach !== undefined), 'BONE_ATTACHMENT_PAIR_REQUIRED');
    return clone(segment);
  });
}

/** Model JSON -> authoring document. No disk reads, teacher lookup, semantic
 * repair, implicit ability insertion, or runtime/game writes. Actual Main
 * schema/defaults/template pinning are injected from the pinned engine. */
export function materializeTarget(target, context, engine, models) {
  assert(context?.heroId && context.heroName, 'OUTPUT_IDENTITY_REQUIRED');
  if (target?.format === 'native-content') {
    exact(target, ['format', 'champion', 'abilities'], 'NATIVE_TARGET_KEYS');
    exact(target.abilities, SLOTS, 'SIX_ABILITIES_REQUIRED');
    assert.equal(target.champion.id, context.heroId, 'HERO_ID_MISMATCH');
    assert.equal(target.champion.name, context.heroName, 'HERO_NAME_MISMATCH');
    assert(!own(target.champion, 'abilities'), 'DUPLICATE_ABILITY_AUTHORITY');
    const abilities = Object.fromEntries(SLOTS.map(slot => {
      const ability = target.abilities[slot];
      assert(ability && ability.slot === slot, 'ABILITY_SLOT_MISMATCH:' + slot);
      assert.equal(ability.id, `${context.heroId}.${slot.toLowerCase()}`, 'ABILITY_ID_MISMATCH:' + slot);
      return [slot, engine.ability.zAbilityDoc.parse(ability)];
    }));
    assert.equal(target.champion.passiveAbility, abilities.PASSIVE.id, 'PASSIVE_REFERENCE_MISMATCH');
    assert.equal(target.champion.exAbility, abilities.EX.id, 'EX_REFERENCE_MISMATCH');
    const champion = engine.champion.zChampionDoc.parse({...clone(target.champion),
      abilities: Object.fromEntries(['Q', 'W', 'E', 'R'].map(slot => {
        const {schema, ...mirror} = abilities[slot];
        return [slot, mirror];
      })),
    });
    return {format: 'native-content', champion, abilities};
  }
  assert.equal(target?.format, 'hero-plan', 'UNSUPPORTED_FULL_HERO_TARGET');
  exact(target, ['format', 'plan', 'presentationSelection'], 'HERO_TARGET_KEYS');
  assert(!own(target.plan, 'templateVersions') && !own(target.plan, 'generatorVersion'), 'MODEL_MUST_NOT_SUPPLY_TRUSTED_VERSIONS');
  assert.equal(target.plan.planId, `${context.heroId}.plan`, 'PLAN_ID_MISMATCH');
  // This function verifies existing contentSha256 pins against the shared
  // engine's actual template definitions; a bad pin never becomes a fallback.
  const plan = engine.templateVersions.pinHeroPlanTemplates(target.plan, engine.templates);
  const selection = target.presentationSelection;
  exact(selection, ['modelKey', 'championIcon', 'slots'], 'PRESENTATION_SELECTION_KEYS');
  exact(selection.slots, SLOTS, 'SIX_PRESENTATION_SLOTS_REQUIRED');
  assert(models && own(models, selection.modelKey), 'MODEL_NOT_IN_PUBLIC_CATALOG:' + selection.modelKey);
  const metadata = models[selection.modelKey];
  assert(Object.keys(metadata).every(key => ['uploadedModel', 'source', 'assetLocks'].includes(key)), 'MODEL_CATALOG_CONTAINS_NON_ASSET_DATA');
  const presentation = engine.presentation.defaultHeroPresentation();
  // A mesh's original identity is catalog data. Its relationship to a newly
  // generated hero is not: do not copy a different hero's exact/proxy claim.
  // Leave optional provenance unasserted pending the identity/asset gate.
  const {source, ...assetMetadata} = clone(metadata);
  Object.assign(presentation, assetMetadata, {modelKey: selection.modelKey, championIcon: selection.championIcon});
  for (const slot of SLOTS) {
    const s = selection.slots[slot];
    exact(s, ['gameplayEvent', 'icon', 'sfxKey', 'vfxLayers', 'scriptSelections'], 'SLOT_PRESENTATION_KEYS:' + slot);
    const {scriptSelections, ...binding} = clone(s);
    const segments = selectionSegments(scriptSelections);
    const abilityId = `${context.heroId}.${slot.toLowerCase()}`;
    Object.assign(presentation.slots[slot], binding, {
      script: segments.length ? {schema: 'vfx-script@1', id: abilityId, abilityId, segments} : null,
    });
  }
  const project = engine.project.zHeroProject.parse({
    schema: 'ggd-hero-project@2', projectId: context.heroId, revision: 0,
    sourceLock: clone(plan.sourceLock),
    brief: {name: context.heroName, concept: plan.summary,
      moveNames: Object.fromEntries(SLOTS.map(slot => [slot, plan.slots[slot].name]))},
    sections: Object.fromEntries(SECTIONS.map(id => [id, {revision: 0, state: 'draft', fieldOwnership: {}}])),
    acceptedPlan: plan, presentation,
    validationState: Object.fromEntries(SECTIONS.map(id => [id, {revision: 0, status: 'idle', diagnosticCodes: []}])),
    receipts: [],
  });
  return {format: 'hero-project', project};
}
