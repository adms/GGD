import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha, SLOTS, validateRecords, modelInput } from './intake.mjs';
import { anchor } from './source-review.mjs';
import { REVIEWS37 } from './community37-review-seeds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Bind this manual reading pass to these exact texts AND annotations. Changing either
// requires a new review version, not regenerating the old report with a new truth.
export const REVIEW_PINS = Object.freeze({
  records: '020a5a1b7ab01b931a4eacbf8170d9f0881db8605fce28bfdd1505ca3dfc260f',
  seeds: 'fdb8fb70eb00a67afcaf831f8def9fb01dbdc343d168e3cfe5d21e6dc00baef1',
});
const expectedKeys = Array.from({ length: 37 }, (_, i) => String(i + 1).padStart(2, '0'));
const devHeroes = new Set(['community37-32', 'community7-warwick', 'community7-leesin', 'community7-missfortune']);
// These are adjudication questions, not silently invented mandatory requirements.
const ambiguities = {
  '18:R': '扇形／直線尚未唯一選定；不得教成兩者同時滿額。',
  '21:W': '「可消耗」暫解為可選增強；零資源仍可施放須與最終設計／行為契約確認。',
  '37:W': '原文只寫消耗一層可取得盾；「零勇氣仍可撤退」是合理解讀，未獲新 Owner 裁定，不能當嚴格 Gold。',
  '37:EX': '技能寫抗恐懼，末段審查重點另寫恐懼解除；抗性和淨化不能默認等價。',
};

export function buildCommunityReviews(records, seeds = REVIEWS37) {
  validateRecords(records);
  assert.deepEqual(Object.keys(seeds).sort(), [...expectedKeys].sort(), 'REVIEW_SET_INCOMPLETE');
  for (const seed of Object.values(seeds)) {
    assert(typeof seed.identity === 'string' && seed.identity.length > 0, 'IDENTITY_MISSING');
    assert(typeof seed.reject === 'string' && seed.reject.length > 0, 'REJECTION_NOTE_MISSING');
    assert.equal(seed.slots.length, 6, 'SIX_SEED_SLOTS_REQUIRED');
    for (const pair of seed.slots) {
      assert(Array.isArray(pair) && pair.length === 2 && pair.every(x => typeof x === 'string' && x.length > 0), 'INVALID_ANNOTATION');
      const tags = pair[0].split(',');
      assert(tags.every(t => /^[a-z][a-z0-9_]*$/.test(t)), 'INVALID_CONCEPT_TAG');
      assert.equal(new Set(tags).size, tags.length, 'DUPLICATE_CONCEPT');
    }
  }
  assert.equal(sha(records), REVIEW_PINS.records, 'REVIEW_RECORDS_DRIFT');
  assert.equal(sha(seeds), REVIEW_PINS.seeds, 'REVIEW_ANNOTATIONS_DRIFT');
  const heroes = records.filter(h => h.origin === 'community37');
  assert.equal(heroes.length, 37, 'COMMUNITY_SCOPE_CHANGED');
  const rows = heroes.map(h => {
    const key = h.id.slice('community37-'.length), seed = seeds[key];
    assert.deepEqual(h.slots.map(s => s.slot), SLOTS, 'REVIEW_SLOT_ORDER_CHANGED');
    const globalStart = h.originalText.indexOf('**審查重點**');
    assert(globalStart >= 0, 'GLOBAL_REVIEW_NOTES_MISSING');
    const globalText = h.originalText.slice(globalStart);
    return {
      id: h.id, name: h.name, sourceFamily: h.sourceFamily, exposure: h.exposure,
      source: { text: h.originalText, sha256: h.originalSha256, reference: h.sourceReference,
        authority: 'historical supplied GGD adaptation; no new independent Owner approval' },
      identity: { original: h.identity, evidence: anchor(h.originalText, h.identity), interpretation: seed.identity },
      globalReview: { original: globalText, evidence: anchor(h.originalText, globalText) },
      status: { allSixSlotsRead: true, fullHeroTextRead: true, globalReviewNotesRead: true,
        sourceIntent: 'assistant-manually-annotated', completeConstraintGoldCertified: false,
        ownerApproved: false, currentEngineCapability: 'pending-adjudication',
        mappingAdmitted: false, trainingAdmitted: false, freshBlindEligible: false,
        devExcludedFromTrainingCandidates: devHeroes.has(h.id), releaseQualified: false },
      plausibleWrongInterpretationToExclude: seed.reject,
      slots: h.slots.map((s, i) => ({ id: s.id, slot: s.slot, name: s.name,
        source: { text: s.originalText, sha256: s.originalSha256,
          evidence: anchor(h.originalText, s.originalText) },
        concepts: seed.slots[i][0].split(','), interpretation: seed.slots[i][1],
        interpretationScope: 'slot plus complete hero context/global review; concept tags are provisional, not an engine capability enum',
        adjudicationQuestions: ambiguities[`${key}:${s.slot}`] ? [ambiguities[`${key}:${s.slot}`]] : [],
        status: { sourceRead: true, mapping: 'quarantined', runtimeVerified: false, trainingAdmitted: false },
      })),
    };
  });
  // Clean inputs contain no manual target, legacy template, review label or runtime answer.
  const inputs = heroes.map(modelInput);
  const concepts = {};
  for (const h of rows) for (const s of h.slots) for (const concept of s.concepts) {
    (concepts[concept] ??= []).push({ heroId: h.id, slot: s.slot, sourceSha256: s.source.sha256 });
  }
  const candidates = rows.filter(h => !devHeroes.has(h.id)).map(h => ({
    heroId: h.id, sourceFamily: h.sourceFamily, sourceSha256: h.source.sha256,
    status: 'source-intent-only-candidate; NOT a train split or training target',
    trainingAdmitted: false, freshBlindEligible: false,
    pending: ['resolve design ambiguity', 'current capability and lowering recipe review',
      'positive and negative behavioral checks', 'mechanism-family split and contamination audit'],
  }));
  // Legacy mapping remains in a DIFFERENT file, retaining its original review state.
  const quarantine = heroes.flatMap(h => h.slots.map(s => ({ heroId: h.id, slotId: s.id,
    sourceSha256: s.originalSha256, legacyTemplate: s.legacyTemplate, historicalReview: s.reviewNotes,
    status: 'quarantined-not-a-supervised-target', trainingAdmitted: false })));
  return { rows, inputs, concepts, candidates, quarantine };
}

export function writeCommunityReviews(out) {
  assert(!fs.existsSync(out), 'REFUSE_OVERWRITE_OUTPUT');
  assert.equal(path.dirname(out), HERE, 'OUTPUT_MUST_BE_NEW_RESEARCH_CHILD');
  const queue = path.join(HERE, 'intake-v1/review-queue.private.json');
  const data = buildCommunityReviews(JSON.parse(fs.readFileSync(queue, 'utf8')));
  const payloads = { 'requirements.private.json': data.rows, 'model-inputs.json': data.inputs,
    'concept-index.private.json': data.concepts, 'source-only-candidates.private.json': data.candidates,
    'mapping-quarantine.private.json': data.quarantine };
  const manifest = { schema: 'ggd-hero12b-community-source-review@1', generatedAt: new Date().toISOString(),
    counts: { heroesRead: data.rows.length, slotsRead: data.rows.flatMap(h => h.slots).length,
      provisionalConcepts: Object.keys(data.concepts).length, sourceOnlyCandidateHeroes: data.candidates.length,
      currentDevExcludedHeroes: 1, quarantinedMappings: data.quarantine.length,
      unresolvedQuestions: data.rows.flatMap(h => h.slots).flatMap(s => s.adjudicationQuestions).length,
      formalTrainingHeroes: 0, freshBlindHeroes: 0 }, reviewPins: REVIEW_PINS,
    pins: [queue, fileURLToPath(import.meta.url), path.join(HERE, 'community37-review-seeds.mjs'), path.join(HERE, 'intake.mjs'), path.join(HERE, 'source-review.mjs')]
      .map(p => ({ path: path.relative(HERE, p), sha256: sha(fs.readFileSync(p)) })),
    artifacts: Object.fromEntries(Object.entries(payloads).map(([f, v]) => [f, sha(v)])),
    trainingStarted: false, mappingAdmitted: false, releaseQualified: false,
    limitations: ['Full source reading is not exhaustive atom-level scoring or independent review.',
      'Concept names describe source intent, not verified engine support or unsupported decisions.',
      'All 37 historically exposed; Azazel is additionally held out of future training candidates because it is current development.',
      'No synthetic paraphrase expansion or legacy template target admission has occurred.',
      'Only actual source text/hash is mechanically anchored; annotation correctness requires semantic review.'],
  };
  const lines = ['# 37 英雄逐槽來源審查清單', '',
    '37 位／222 槽全文、角色採用版本及文末審查重點已逐份閱讀，留下人工解讀與易誤讀處。這不是把舊模板換標籤後直接開訓練。', '',
    '目前：222 個舊映射仍隔離；正式訓練 0；新盲測 0。36 位只列為後續審查候選，阿薩謝爾保留開發用途。全部已有歷史曝光，不能重新命名為盲測。', '',
    `概念索引 ${manifest.counts.provisionalConcepts} 種為暫定檢索標籤，不代表引擎有這麼多能力。IR 尚未表示的機制不自動標「引擎不支援」。`, '',
    '明確待裁定：吉爾伽美什 R 的扇形／直線選擇、鹿目圓 W 的無資源行為、吉伊卡哇 W 的無勇氣撤退，以及 EX 的抗恐懼／解除恐懼差異。其他數值與完整行為仍需逐案審查。', '',
    '| 英雄 | 六槽來源 | 人工解讀重點 | 模板／行為 | 正式訓練 |',
    '| --- | --- | --- | --- | --- |',
    ...data.rows.map(h => `| ${h.name} | 6/6 已讀 | ${h.identity.interpretation.replaceAll('|', '／')} | 映射隔離／待驗證 | ${h.status.devExcludedFromTrainingCandidates ? '開發排除' : '未准入'} |`), '',
    '## 檔案用途', '',
    '- `requirements.private.json`：完整原文、身分與審查段落證據、222 槽解讀、明確狀態；不得當成已通過的執行配方。',
    '- `model-inputs.json`：只有原始來源，不混答案或歷史模板。',
    '- `source-only-candidates.private.json`：36 位未准入候選，尚未切正式 train/validation/test。',
    '- `mapping-quarantine.private.json`：舊模板與舊審查分離保留，不向基線模型提供。',
    '- `concept-index.private.json`：跨英雄需求檢索，下一步對照當前 schema／handler／行為測試。', '',
    '下一步是來源意圖 → 當前能力證據 → 合法配方 → 正反行為驗證 → 家族切分；不是以編譯成功代替機制正確。', ''];
  fs.mkdirSync(out);
  for (const [file, value] of Object.entries({ ...payloads, 'manifest.json': manifest })) fs.writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(out, 'README.md'), lines.join('\n'), { flag: 'wx' });
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'USAGE: node community37-review.mjs NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(writeCommunityReviews(path.resolve(process.argv[2])), null, 2));
}
