import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
export const sha = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMUNITY = 'outputs/community37-corrected-dataset-20260907-v1/data';
const SEVEN = 'outputs/forge-final-three-hours-20260906/seven-heroes-source-v1';

// This is structural intake, not automatic semantic review or training admission.
export function communityRecords(heroes, references, quarantine) {
  assert.equal(heroes.length, 37, 'COMMUNITY_HERO_COUNT');
  assert.equal(references.length, 222, 'COMMUNITY_SLOT_COUNT');
  assert.equal(quarantine.length, 222, 'QUARANTINE_COUNT');
  assert.equal(new Set(quarantine.map(r => r.id)).size, 222, 'DUPLICATE_QUARANTINE');
  const q = new Map(quarantine.map(r => [r.id, r]));
  const records = heroes.map(h => {
    assert.equal(sha(h.sourceOwnerText), h.sha256, 'HERO_SOURCE_CHANGED');
    assert.equal(h.split, 'train', 'LEGACY_TRAIN_SCOPE_CHANGED');
    const rows = references.filter(r => `community37-${r.heroIndex}` === h.id);
    assert.deepEqual(rows.map(r => r.slot).sort(), [...SLOTS].sort(), 'SIX_SLOTS_REQUIRED');
    return {
      id: h.id, name: h.name, origin: 'community37', sourceFamily: `franchise:${h.franchise}`,
      familyReview: 'historical-franchise-label; mechanism-family review still required',
      originalText: h.sourceOwnerText, originalSha256: h.sha256,
      identity: h.identity, legacySplit: h.split,
      exposure: 'historically-evaluated; legacy train candidate, not fresh blind test',
      sourceReference: `${COMMUNITY}/hero-reference.json`,
      slots: SLOTS.map(slot => {
        const r = rows.find(r => r.slot === slot);
        assert.equal(r.hero, h.name); assert.equal(r.franchise, h.franchise);
        assert.equal(r.identityOriginal, h.identity);
        assert.equal(sha(r.ownerOriginal), r.ownerSha256, 'SLOT_SOURCE_CHANGED');
        assert(h.sourceOwnerText.includes(r.ownerOriginal), 'SLOT_NOT_IN_HERO_SOURCE');
        assert.equal(r.templateTrainingAdmitted, false, 'QUARANTINE_PROMOTED');
        assert.equal(r.ownerGold, false, 'OWNER_GOLD_FABRICATED');
        assert(q.has(r.id), 'QUARANTINE_MISSING');
        assert.deepEqual(q.get(r.id).template, r.originalTemplate, 'QUARANTINE_TEMPLATE_CHANGED');
        return { id: r.id, slot, name: r.name, originalText: r.ownerOriginal, originalSha256: r.ownerSha256,
          review: { sourceClaims: 'historical-assistant-reviewed', wholeSlotSemantics: 'unreviewed-this-round',
            ownerApproved: false, mapping: 'quarantined', capability: 'not-adjudicated',
            compiler: 'historical-artifact-only', behavior: 'not-revalidated', trainingAdmitted: false },
          evidenceReference: `${COMMUNITY}/corrected-reference.json#${r.id}`,
          legacyTemplate: r.originalTemplate,
          reviewNotes: { currentBehavior: r.currentBehavior, requiredRefinement: r.requiredRefinement, corrections: r.corrections },
        };
      }),
    };
  });
  assert.equal(new Set(records.map(r => r.id)).size, 37, 'DUPLICATE_HERO');
  assert.equal(new Set(references.map(r => r.id)).size, 222, 'DUPLICATE_SLOT');
  return records;
}

export function sevenRecords(heroes) {
  assert.equal(heroes.length, 7, 'SEVEN_HERO_COUNT');
  return heroes.map(h => {
    const recipe = h.recipe;
    assert.equal(h.id, recipe.id);
    assert.deepEqual(Object.keys(recipe.moves).sort(), [...SLOTS].sort(), 'SIX_SLOTS_REQUIRED');
    assert(h.sourceText && recipe.summary);
    return { id: `community7-${h.id}`, name: recipe.name, origin: 'community7',
      sourceFamily: 'franchise:league-of-legends-ggd-adaptation',
      familyReview: 'conservative shared franchise; no cross-hero blind split within this cohort',
      originalText: h.sourceText, originalSha256: sha(h.sourceText),
      identity: [recipe.summary, ...recipe.adaptations].join('\n'), legacySplit: h.split,
      exposure: 'historically-evaluated; not fresh blind test',
      sourceReference: `${SEVEN}/heroes.json`,
      slots: SLOTS.map(slot => {
        const m = recipe.moves[slot];
        assert(h.sourceText.includes(m.purpose), 'SLOT_NOT_IN_HERO_SOURCE');
        return { id: `community7-${h.id}-${slot.toLowerCase()}`, slot, name: m.name,
          originalText: m.purpose, originalSha256: sha(m.purpose),
          review: { sourceClaims: 'historical-assistant-reviewed', wholeSlotSemantics: 'unreviewed-this-round',
            ownerApproved: false, mapping: 'pending-revalidation', capability: 'not-adjudicated',
            compiler: 'historical-artifact-only', behavior: 'not-revalidated', trainingAdmitted: false },
          evidenceReference: `${SEVEN}/heroes.json#${h.id}`,
          legacyTemplate: { ref: m.ref, params: m.params, authorEffects: m.effects ?? [] },
          reviewNotes: { reason: 'Author effects are separate from template-native capabilities; compile is not fidelity proof.' },
        };
      }),
    };
  });
}

export function validateRecords(records) {
  const ids = new Set(); const slotIds = new Set();
  for (const h of records) {
    assert(!ids.has(h.id), 'DUPLICATE_HERO'); ids.add(h.id);
    assert.equal(sha(h.originalText), h.originalSha256, 'HERO_SOURCE_CHANGED');
    assert(h.sourceFamily && h.exposure);
    assert.deepEqual(h.slots.map(s => s.slot).sort(), [...SLOTS].sort(), 'SIX_SLOTS_REQUIRED');
    for (const s of h.slots) {
      assert(!slotIds.has(s.id), 'DUPLICATE_SLOT'); slotIds.add(s.id);
      assert.equal(sha(s.originalText), s.originalSha256, 'SLOT_SOURCE_CHANGED');
      assert.equal(s.review.trainingAdmitted, false, 'UNREVIEWED_TRAINING_ADMISSION');
      assert.equal(s.review.ownerApproved, false, 'UNREVIEWED_OWNER_APPROVAL');
      assert(['quarantined', 'pending-revalidation'].includes(s.review.mapping), 'MAPPING_PROMOTED');
    }
  }
  return { heroes: ids.size, slots: slotIds.size, sourceFamilies: new Set(records.map(h => h.sourceFamily)).size,
    trainingAdmitted: 0, freshBlindTestAdmitted: 0,
    quarantinedMappings: records.flatMap(h => h.slots).filter(s => s.review.mapping === 'quarantined').length,
    pendingMappings: records.flatMap(h => h.slots).filter(s => s.review.mapping === 'pending-revalidation').length };
}

export function modelInput(h) {
  // Explicit allow-list: no historical answer/template/compiler output/review label leaks.
  return { id: h.id, hero: { name: h.name, originalText: h.originalText, sourceSha256: h.originalSha256 },
    slots: h.slots.map(s => ({ slot: s.slot, name: s.name, originalText: s.originalText, sourceSha256: s.originalSha256 })) };
}

export function auditPins(root, pins, base = '') {
  return pins.map(pin => {
    const relative = path.join(base, pin.path); const absolute = path.resolve(root, relative);
    assert(absolute.startsWith(path.resolve(root) + path.sep), 'PIN_OUTSIDE_WORKSPACE');
    const actual = fs.existsSync(absolute) ? sha(fs.readFileSync(absolute)) : null;
    return { path: relative, expectedSha256: pin.sha256, actualSha256: actual,
      status: actual === pin.sha256 ? 'matches' : actual === null ? 'missing' : 'changed' };
  });
}

export function buildIntake(root, out) {
  assert(!fs.existsSync(out), 'REFUSE_OVERWRITE_OUTPUT');
  const files = [`${COMMUNITY}/hero-reference.json`, `${COMMUNITY}/corrected-reference.json`, `${COMMUNITY}/template-quarantine.json`,
    `${COMMUNITY}/dataset-manifest.json`, `${SEVEN}/heroes.json`, `${SEVEN}/manifest.json`];
  const [heroes, refs, quarantine, communityManifest, seven, sevenManifest] = files.map(p => read(path.join(root, p)));
  const records = [...communityRecords(heroes, refs, quarantine), ...sevenRecords(seven)];
  const counts = validateRecords(records);
  const pins = [...auditPins(root, communityManifest.sourcePins),
    ...auditPins(root, sevenManifest.pins, sevenManifest.repo.replace(path.resolve(root) + '/', ''))];
  const matches = pins.filter(p => p.status === 'matches').length;
  const groups = {};
  for (const h of records) (groups[h.sourceFamily] ??= []).push(h.id);
  const exactGroups = {};
  for (const h of records) for (const s of h.slots) (exactGroups[sha(s.originalText.normalize('NFKC').replace(/\s/g, ''))] ??= []).push(s.id);
  const duplicateSlots = Object.values(exactGroups).filter(ids => ids.length > 1);
  const manifest = { schema: 'ggd-hero12b-intake@1', counts,
    scope: 'First two complete-hero cohorts only; not an exhaustive workspace or semantic audit.',
    generatedAt: new Date().toISOString(), pipelineStage: 'structural-intake-only',
    generatorSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    sourcePins: files.map(p => ({ path: p, sha256: sha(fs.readFileSync(path.join(root, p))) })),
    upstreamPinAudit: { total: pins.length, matches, changed: pins.filter(p => p.status === 'changed').length,
      missing: pins.filter(p => p.status === 'missing').length },
    wholeHeroSemanticReviewCompleted: false, splitFrozen: false, modelInferenceStarted: false,
    trainingStarted: false, automaticMerge: false, releaseQualified: false,
    followup: ['Review source drift before reusing current recipes', 'Atomize all requirements with source spans',
      'Verify current capability/compiler/behavior pins', 'Revalidate mappings',
      'Collect genuinely independent new hero/source families for blind evaluation'],
  };
  fs.mkdirSync(out, { recursive: true });
  const put = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  put('manifest.json', manifest); put('review-queue.private.json', records);
  put('source-inputs.json', records.map(modelInput)); put('upstream-drift.json', pins);
  put('family-groups.json', { status: 'provisional-not-a-train-test-split', groups, duplicateSlots,
    limitation: 'NFKC/whitespace equality only; not semantic deduplication or mechanism-family independence.' });
  const rows = records.map(h => `| ${h.name} | ${h.sourceFamily} | ${h.slots.length} | ${h.slots[0].review.mapping} | 待重新逐槽審查 | 不可 |`);
  const report = ['# 完整英雄資料初次盤點（CPU-only）', '',
    `已收錄 ${counts.heroes} 名英雄／${counts.slots} 槽，分屬 ${counts.sourceFamilies} 個暫定作品家族。這是 37＋7 兩批完整來源的結構盤點，不是全部工作區資料，也不是本輪語意審查完成。`, '',
    `正向訓練映射核准 0；${counts.quarantinedMappings} 槽保留隔離、${counts.pendingMappings} 槽待重新驗證。44 名皆已有歷史評估曝光，不當作新盲測。`, '',
    `上游來源 hash：${pins.length} 項，${matches} 相符、${manifest.upstreamPinAudit.changed} 改變、${manifest.upstreamPinAudit.missing} 缺失。詳見 upstream-drift.json；舊快照保留，不以新 hash 偷換來源。`, '',
    `完全相同／去空白相同的技能文字組：${duplicateSlots.length}。家族與重複組必須在切分前處理；作品分組不等於機制家族已獨立。`, '',
    '| 英雄 | 暫定來源家族 | 槽數 | 模板映射 | 完整語意審查 | 新盲測 |', '| --- | --- | ---: | --- | --- | --- |', ...rows, '',
    'source-inputs.json 只包含原文與來源摘要；review-queue.private.json 另存舊模板和待審說明，不能把後者直接送進基線模型提示。', '',
    '下一步：核對來源差異、逐槽拆必要要求與跨槽依賴、建立當前能力契約與行為證據，再决定哪些資料能進訓練或完整英雄基線。', ''].join('\n');
  fs.writeFileSync(path.join(out, 'REPORT.md'), report, { flag: 'wx' });
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'USAGE: node intake.mjs NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(buildIntake(path.resolve(HERE, '../..'), path.resolve(process.argv[2])), null, 2));
}
