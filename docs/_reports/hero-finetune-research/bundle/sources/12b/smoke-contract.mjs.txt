import assert from 'node:assert/strict';
import { normalizeFinal } from './normalize.mjs';
import { SLOTS } from './intake.mjs';

const STATUS = ['full', 'partial', 'unsupported', 'needs_clarification'];
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const keys = (value, allowed) => { assert(object(value), 'OBJECT_REQUIRED'); assert.deepEqual(Object.keys(value).sort(), [...allowed].sort(), 'EXACT_KEYS_REQUIRED'); };
const str = value => assert(typeof value === 'string' && value.trim().length > 0, 'NONEMPTY_STRING_REQUIRED');
const strings = values => { assert(Array.isArray(values), 'STRING_ARRAY_REQUIRED'); values.forEach(str); };

export function validateProposal(value, source, catalog) {
  keys(value, ['hero', 'status', 'relations', 'slots']);
  keys(value.hero, ['name', 'origin', 'identitySummary']);
  assert.equal(value.hero.name, source.hero.name, 'HERO_NAME_DRIFT'); str(value.hero.origin); str(value.hero.identitySummary);
  const origin = source.hero.originalText.match(/^出身：(.+)$/m)?.[1];
  if (origin) assert.equal(value.hero.origin, origin, 'EXPLICIT_ORIGIN_DRIFT');
  assert(STATUS.includes(value.status), 'UNKNOWN_STATUS');
  keys(value.slots, SLOTS);
  const allSource = [source.hero.originalText, ...(source.supplements ?? []).map(s => s.text)];
  assert(Array.isArray(value.relations) && value.relations.length <= 32, 'RELATIONS_ARRAY_REQUIRED');
  for (const r of value.relations) {
    keys(r, ['from', 'to', 'kind', 'evidence', 'description']);
    assert(SLOTS.includes(r.from) && SLOTS.includes(r.to) && r.from !== r.to, 'RELATION_SLOTS');
    assert(['independent', 'requires', 'conditional'].includes(r.kind), 'RELATION_KIND');
    str(r.evidence); str(r.description); assert(allSource.some(t => t.includes(r.evidence)), 'RELATION_EVIDENCE_NOT_IN_SOURCE');
  }
  const refs = new Map(catalog.map(t => [t.id, t]));
  for (const slot of SLOTS) {
    const s = value.slots[slot];
    keys(s, ['status', 'sourceEvidence', 'mechanismSummary', 'templates', 'abilityOverrides', 'unresolved', 'vfxRecommendation']);
    assert(STATUS.includes(s.status), 'UNKNOWN_SLOT_STATUS'); str(s.mechanismSummary);
    strings(s.sourceEvidence); assert(s.sourceEvidence.length > 0, 'SLOT_SOURCE_EVIDENCE_REQUIRED'); strings(s.unresolved);
    const slotSources = [source.slots.find(s => s.slot === slot).originalText, ...(source.supplements ?? []).map(s => s.text)];
    for (const quote of s.sourceEvidence) assert(slotSources.some(t => t.includes(quote)), `SLOT_EVIDENCE_NOT_IN_SOURCE:${slot}`);
    assert(s.vfxRecommendation === null || typeof s.vfxRecommendation === 'string', 'VFX_PARAMETERS_FORBIDDEN');
    assert(object(s.abilityOverrides), 'OVERRIDES_OBJECT_REQUIRED');
    assert(Object.keys(s.abilityOverrides).every(k => ['rangeTier', 'cooldownTier', 'manaCostTier', 'castTimeTier', 'effects', 'statusCost'].includes(k)), 'OVERRIDE_NOT_IN_SMOKE_CONTRACT');
    assert(Array.isArray(s.templates) && s.templates.length <= 8, 'TEMPLATE_ARRAY_REQUIRED');
    for (const t of s.templates) {
      keys(t, ['ref', 'params']); assert(refs.has(t.ref), `TEMPLATE_NOT_ENABLED:${t.ref}`); assert(object(t.params), 'PARAMS_OBJECT_REQUIRED');
      // Engine compatibility accepts extra params in places. This automated
      // authoring contract deliberately rejects silently ignored field names.
      assert(Object.keys(t.params).every(k => k in refs.get(t.ref).params), `UNKNOWN_TEMPLATE_PARAM:${slot}:${t.ref}`);
    }
    if (s.status === 'full') { assert(s.templates.length > 0, 'FULL_WITHOUT_PRODUCT'); assert.equal(s.unresolved.length, 0, 'FULL_WITH_UNRESOLVED'); }
  }
  if (value.status === 'full') assert(SLOTS.every(s => value.slots[s].status === 'full'), 'OVERALL_FULL_WITH_INCOMPLETE_SLOT');
  return { outputSchema: true, literalEvidenceAnchored: true,
    fullClaimed: value.status === 'full', semanticQualified: false, automaticAccept: false };
}

export function assessEnvelope(envelope, source, catalog) {
  const normalized = normalizeFinal(envelope);
  if (!normalized.ok) return { normalization: normalized, contract: null, error: normalized.error, automaticAccept: false };
  try { return { normalization: normalized, contract: validateProposal(normalized.value, source, catalog), error: null, automaticAccept: false }; }
  catch (e) { return { normalization: normalized, contract: null, error: String(e.message), automaticAccept: false }; }
}
