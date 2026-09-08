import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SLOTS, sha, verifiedBytes, contained, parseOwnerSources, communityRequest, communityTarget, nativeRequest, makeExamples, writeNew, activationConflicts, catalogContext} from './hero-distillation-pairs.mjs';

function project() {
  const slots = Object.fromEntries(SLOTS.map(slot => [slot, {name: slot, ownerDescription: `${slot} 原文`, baselineBehavior: 'tpl-secret-answer', requiredRefinement: 'not-input'}]));
  const ownerText = '英雄原文與跨槽資源；「對白」不可變機制。\n';
  return {brief: {name: 'test'}, sourceDesign: {name: 'test', identity: '作品與指定版本', ownerText, sourceSha256: sha(ownerText), slots},
    acceptedPlan: {schema: 'hero-plan@1', generatorVersion: 'old', templateVersions: {large: {}}, slots: Object.fromEntries(SLOTS.map(slot => [slot, {
      slot, name: slot, products: [{template: {id: 'tpl-resource-ops', params: {resourceKey: 'shared', max: 3, consume: slot === 'EX'}}}],
      abilityOverrides: {onHit: [{kind: 'marker', abilityId: 'hero.ex'}]},
    }]))}, presentation: {modelKey: 'champ.thorne', championIcon: null,
      slots: Object.fromEntries(SLOTS.map(slot => [slot, {slot, gameplayEvent: 'abilityCast', sfxKey: null, icon: null,
        vfxLayers: [{vfxKey: 'fx.spark', tint: [1, 2, 3], scale: 5}],
        script: {segments: [{kind: 'vfx', on: 'castEffect', at: 'target', vfxId: 'fx.spark', w3xScale: 4, alpha: .6}]}}]))}};
}

const independent = p => structuredClone(p.sourceDesign);
test('community input has full Owner text but no executable answer fields', () => {
  const p = project(), r = communityRequest(p, independent(p));
  assert.equal(r.ownerText, p.sourceDesign.ownerText);
  assert.equal(Object.keys(r.slots).length, 6);
  assert(!JSON.stringify(r).includes('tpl-secret-answer'));
  assert(!JSON.stringify(r).includes('requiredRefinement'));
});
test('source text and hero identity drift fail closed', () => {
  const p = project(), source = independent(p); p.sourceDesign.ownerText += '改';
  assert.throws(() => communityRequest(p, source), /OWNER_SOURCE_TEXT_DRIFT/);
  const q = project(); q.sourceDesign.name = 'different';
  assert.throws(() => communityRequest(q, independent(q)), /OWNER_IDENTITY_MISMATCH/);
});
test('projection preserves all gameplay parameters and cross-slot refs', () => {
  const p = project(), t = communityTarget(p);
  assert.deepEqual(t.plan.slots, p.acceptedPlan.slots);
  assert.equal(t.plan.generatorVersion, undefined);
  assert.equal(t.plan.templateVersions, undefined);
  assert.equal(t.presentationSelection.slots.Q.scriptSelections[0].vfxId, 'fx.spark');
  assert.equal(t.presentationSelection.slots.Q.scriptSelections[0].alpha, undefined);
  assert.equal(p.presentation.slots.Q.script.segments[0].alpha, .6);
});
test('native input never substitutes the teacher description for absent Owner source', () => {
  const c = {name: 'hero'}, a = {Q: {id: 'h.q', name: 'Q', description: 'ANSWER_TEXT'}};
  const r = nativeRequest(c, a, {description: 'prior-source'}, {'h.q': {description: 'OWNER_TEXT'}});
  assert.equal(r.request.slots.Q.description, 'OWNER_TEXT');
  assert(!JSON.stringify(r.request).includes('ANSWER_TEXT'));
  assert.equal(r.missing.length, 5);
});
test('TSV wins over old source while preserving literal dialogue and line breaks', () => {
  const module = 'const OWNER_SKILL_SOURCE_BASE_OVERRIDES = {"godie-h.q":{"description":"old"}\n};';
  const tsv = 'id\tname\tdescription\ngodie-h.q\tQ\t"[主動]\n「hi」\n"';
  const result = parseOwnerSources(module, tsv);
  assert.equal(result['godie-h.q'].description, '[主動]\n「hi」\n');
});
test('single bad slot excludes its full-hero positive but retains other slots', () => {
  const p = project(), hero = {id: 'hero', groupId: 'hero', teacherSha256: 'abc', request: communityRequest(p, independent(p)), target: communityTarget(p)};
  const rows = makeExamples(hero, [{heroId: 'hero', slot: 'Q', teacherSha256: 'abc', reason: 'wrong-target', evidence: 'receipt.json'}]);
  assert.equal(rows.length, 7);
  assert.equal(rows.filter(r => r.pairingEligible).length, 5);
  assert(!rows.find(r => r.slot === 'HERO').pairingEligible);
  assert(rows.every(r => !r.trainingAdmitted && !r.releaseQualified));
  assert.deepEqual(rows.find(r => r.slot === 'EX').request.slots, hero.request.slots);
});
test('a full-hero-only exclusion does not invalidate reliable slots', () => {
  const p = project(), hero = {id: 'hero', groupId: 'hero', teacherSha256: 'abc', request: communityRequest(p, independent(p)), target: communityTarget(p)};
  const rows = makeExamples(hero, [{heroId: 'hero', slot: 'HERO', teacherSha256: 'abc', reason: 'cross-slot', evidence: 'receipt.json'}]);
  assert.equal(rows.filter(r => r.pairingEligible).length, 6);
});
test('old exclusions cannot silently be applied to a repaired teacher version', () => {
  const p = project(), hero = {id: 'hero', groupId: 'hero', teacherSha256: 'new', request: communityRequest(p, independent(p)), target: communityTarget(p)};
  assert.throws(() => makeExamples(hero, [{heroId: 'hero', slot: 'Q', teacherSha256: 'old', reason: 'old', evidence: 'receipt'}]), /STALE_EXCLUSION/);
});
test('explicit source/teacher activation conflicts are excluded, not repaired', () => {
  const h = {id: 'h', teacherSha256: 'v1', provenance: {sourcePath: 'source'}, request: {slots: {Q: {description: '[主動][指定]\n舊版要求'}}},
    target: {format: 'native-content', abilities: {Q: {description: '[被動][週期]\n新版成品'}}}};
  const conflicts = activationConflicts(h);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].slot, 'Q');
  assert.equal(conflicts[0].reason, 'source-teacher-activation-version-conflict');
  h.target.abilities.Q.description = '[主動][輔助]\n新文';
  assert.equal(activationConflicts(h).length, 0);
  h.target.abilities.Q.description = '標籤未知';
  assert.equal(activationConflicts(h).length, 0); // Not certified correct, simply not this known conflict.
});
test('source containment, file sizes and hashes are enforced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ggd-distillation-unit-'));
  fs.writeFileSync(path.join(root, 'source.json'), '{}');
  assert.equal(verifiedBytes(root, {path: 'source.json', bytes: 2, sha256: sha('{}')}).toString(), '{}');
  assert.throws(() => contained(root, '../escape'), /PATH_ESCAPE/);
  assert.throws(() => verifiedBytes(root, {path: 'source.json', bytes: 2, sha256: 'wrong'}), /HASH_DRIFT/);
  assert.throws(() => verifiedBytes(root, {path: 'source.json', bytes: 3, sha256: sha('{}')}), /SIZE_DRIFT/);
});
test('catalog has version-matched parameter contracts but no teacher exemplars', () => {
  const b = {capabilityFingerprint: 'fp', bricks: [{id: 'x', layer: 'effect', usedBy: ['secret-hero'], params: [{name: 'field', type: 'number', default: 1, origin: 'secret-answer'}]}]};
  const c = catalogContext(b, {fingerprint: 'fp', unsupported: ['unsafe']}, 'revision');
  assert.equal(c.bricks[0].params[0].default, 1);
  assert.deepEqual(c.constraints.unsupported, ['unsafe']);
  assert(!JSON.stringify(c).includes('secret'));
  assert.throws(() => catalogContext(b, {fingerprint: 'other'}, 'revision'), /CATALOG_FINGERPRINT_MISMATCH/);
});
test('output must be a new directory and is hash indexed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ggd-distillation-unit-'));
  const out = path.join(root, 'out');
  writeNew(out, {manifest: {schema: 'test'}, examples: [{id: 'one'}]});
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
  assert.equal(m.outputs['examples.json'], sha(fs.readFileSync(path.join(out, 'examples.json'))));
  assert.throws(() => writeNew(out, {}), /OUTPUT_ALREADY_EXISTS/);
});
