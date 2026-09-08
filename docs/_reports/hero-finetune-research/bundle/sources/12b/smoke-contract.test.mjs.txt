import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProposal, assessEnvelope } from './smoke-contract.mjs';
import { SLOTS } from './intake.mjs';
const requests = JSON.parse(fs.readFileSync(new URL('./development-smoke-v2/requests.json', import.meta.url)));
const { source, catalog } = JSON.parse(requests[1].messages[1].content);
const fixture = () => ({ hero: { name: source.hero.name, origin: '鬥士', identitySummary: '語法測試，不宣稱原意正確' }, status: 'partial', relations: [],
  slots: Object.fromEntries(SLOTS.map(slot => [slot, { status: 'partial', sourceEvidence: [source.slots.find(s => s.slot === slot).originalText],
    mechanismSummary: '待實際語意審查', templates: [], abilityOverrides: {}, unresolved: ['語法 fixture'], vfxRecommendation: null }])) });
test('partial fixture is well formed but cannot become automatic semantic acceptance', () => {
  const r = validateProposal(fixture(), source, catalog); assert(r.outputSchema); assert.equal(r.automaticAccept, false); assert.equal(r.semanticQualified, false);
});
for (const [label, mutate, error] of [
  ['missing slot', v => delete v.slots.EX, /EXACT_KEYS_REQUIRED/],
  ['wrong hero', v => v.hero.name = '其他英雄', /HERO_NAME_DRIFT/],
  ['wrong explicit origin', v => v.hero.origin = '法師', /EXPLICIT_ORIGIN_DRIFT/],
  ['unsupported full claim', v => v.status = 'full', /OVERALL_FULL_WITH_INCOMPLETE_SLOT/],
  ['unanchored source', v => v.slots.Q.sourceEvidence = ['Q 命中後才能開 EX'], /SLOT_EVIDENCE_NOT_IN_SOURCE/],
  ['invented template', v => v.slots.Q.templates = [{ ref: 'tpl-never-existing', params: {} }], /TEMPLATE_NOT_ENABLED/],
  ['ignored param', v => v.slots.Q.templates = [{ ref: 'tpl-single-strike', params: { invulnerabilityMadeUp: true } }], /UNKNOWN_TEMPLATE_PARAM/],
  ['VFX tuning', v => v.slots.Q.vfxRecommendation = { scale: 1.4 }, /VFX_PARAMETERS_FORBIDDEN/],
]) test(label, () => { const v = fixture(); mutate(v); assert.throws(() => validateProposal(v, source, catalog), error); });
test('truncated JSON fails before content checks; normalizer never fills missing slots', () => {
  const r = assessEnvelope({ channel: 'final', text: '{', finishReason: 'length' }, source, catalog);
  assert(r.error); assert.equal(r.automaticAccept, false);
});
