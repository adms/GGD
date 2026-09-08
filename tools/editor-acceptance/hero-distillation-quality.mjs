import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha = x => createHash('sha256').update(x).digest('hex');
const hash = x => sha(JSON.stringify(x));
const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
const REVIEWED_REPORT_SHA = '293e01c6f5e9c5f589cff17178395193e9a00cbd0f990459529be7ff6f14bd64';
// Bounded review of the existing, pinned 37 heroes. These are training
// decisions, not new hero answers or a claim that all other slots are broken.
// Asset-only caveats do not disqualify otherwise aligned gameplay teaching.
export const COMMUNITY_KEEP = {
  1: ['R'], 3: ['E'], 6: ['R'], 9: ['Q'], 12: ['Q'], 16: ['EX'], 17: ['W'],
  19: ['E'], 23: ['R'], 24: ['Q'], 25: ['Q'], 28: ['W'], 30: ['Q'], 31: ['R'],
  32: SLOTS, 35: ['W'], 37: ['Q'],
};
const EXPLICIT_NOTES = {
  '15:Q': 'Source asks one nearby enemy and paired action. Ground-target throw does not establish that single-victim paired-action contract.',
  '15:W': 'Current revision repairs the template swap but still has only self shield; source requires morale consumption and weaker fallback.',
  '15:E': 'Source requires stopping on first enemy. Fixed toPoint leap plus onLand damage does not establish first-contact stopping.',
  '19:Q': 'Source specifies one hit per hand. DoT plus independent landing damage has not established exactly two hit opportunities; conservatively exclude.',
  '11:R': 'Ground/reresolve delayed area has a previously observed ground-anchor risk. This exact revision has no runtime anchor receipt here; exclude rather than assume repaired or universally broken.',
  '21:R': 'A target-bound DoT is not evidence of a persistent selected-ground arrow-rain region; exclude this source/output pairing.',
  '30:R': 'A target-bound DoT is not evidence of three waves resolving the selected region; exclude this source/output pairing.',
  '23:EX': 'Generic damage plus 0.5s stun adds immobilization beyond the requested interrupt; no source authorization recorded for that addition.',
  '25:E': 'Source requests movement/collision stopping; teacher additionally inflicts landing damage and knockback.',
  '27:E': 'Source requests bounded flight movement; teacher additionally inflicts landing damage.',
  '28:Q': 'Source requests step-and-slash; teacher additionally applies knockback, without source authorization for that addition.',
  '33:E': 'Source requests approach-and-slash; teacher additionally applies knockback, without source authorization for that addition.',
  '34:Q': 'Source requests a short dash claw attack; teacher additionally applies knockback, without source authorization for that addition.',
};

export function gameplay(ability) {
  // Include every executable field, not just effect names. Exclude only the
  // displayed text and redundant template recipe after actual compilation.
  return Object.fromEntries(Object.entries(ability).filter(([k]) => !['name', 'description', 'template', 'icon'].includes(k)));
}

export function qualify(heroes, examples, artifacts, compiled, report, expectedReportSha, reportSha) {
  assert.equal(reportSha, expectedReportSha, 'REVIEW_ENGINE_OUTPUT_DRIFT');
  assert.equal(reportSha, REVIEWED_REPORT_SHA, 'REVIEW_NOT_VALID_FOR_DIFFERENT_TEACHER_REVISION');
  const rows = [], decisions = [];
  for (const hero of heroes) {
    const raw = artifacts[hero.id];
    assert.equal(hash(raw), hero.teacherSha256, 'TEACHER_DRIFT');
    if (hero.family !== 'community37') continue;
    const n = Number(hero.id.match(/^community-review-(\d+)-20260907$/)?.[1]);
    assert(n >= 1 && n <= 37, 'UNREVIEWED_COMMUNITY_HERO');
    for (const slot of SLOTS) {
      const kept = (COMMUNITY_KEEP[n] ?? []).includes(slot);
      const purpose = hero.target.plan.slots[slot].purpose;
      const warning = purpose.split('【待補機制】')[1] ?? purpose;
      const row = {heroId: hero.id, heroName: hero.request.heroName, slot,
        decision: kept ? 'retain-teacher-demonstration' : 'exclude-unresolved-pairing',
        teacherSha256: hero.teacherSha256, engineRevision: hero.provenance.gameRevision,
        source: hero.request.slots[slot], teacherPurpose: purpose,
        compiledGameplay: gameplay(compiled[hero.id].abilityDrafts[slot]),
        compiledGameplaySha256: hash(gameplay(compiled[hero.id].abilityDrafts[slot])),
        reason: kept ? 'Core requested gameplay is represented in this teacher. Visual fine-tuning is outside training; this is not match/semantic certification.'
          : EXPLICIT_NOTES[`${n}:${slot}`] ?? `Pinned teacher still flags an unresolved gameplay requirement; actual compiled executable fields retained for review: ${warning}`,
        // Conservative exclusion is not a universal engine-unsupported claim.
        engineDefectConfirmed: false, releaseQualified: false};
      rows.push(row);
      if (!kept) decisions.push({heroId: hero.id, slot, teacherSha256: hero.teacherSha256, reason: row.reason});
    }
  }
  const byHero = new Map(report.rows.map(r => [r.heroId, r]));
  const tasks = examples.map(example => {
    const affected = decisions.filter(d => d.heroId === example.heroId && (example.slot === 'HERO' || example.slot === d.slot));
    const structure = byHero.get(example.heroId);
    const structureOk = example.slot === 'HERO' ? structure.compileOk && structure.projection?.gameplayPreserved
      : structure.slots[example.slot]?.compileOk;
    return {id: example.id, heroId: example.heroId, groupId: example.groupId, slot: example.slot,
      priorPairingEligible: example.pairingEligible, originalIssues: example.issues,
      qualityExclusions: affected.map(d => ({slot: d.slot, reason: d.reason})),
      trainingEligible: Boolean(example.pairingEligible && structureOk && affected.length === 0),
      basis: example.provenance.family ?? 'existing-versioned-teacher-demonstration',
      exhaustiveSemanticGold: false, releaseQualified: false};
  });
  const eligible = tasks.filter(t => t.trainingEligible);
  return {schema: 'ggd-distillation-training-quality@1',
    policy: 'Source-paired, structurally verified existing teachers; conservative explicit-gap exclusion; no source repair, new heroes, or all-corpus human Gold requirement.',
    counts: {candidateTasks: tasks.length, sourcePaired: tasks.filter(t => t.priorPairingEligible).length,
      communitySlotsReviewed: rows.length, communitySlotsRetained: rows.filter(r => r.decision.startsWith('retain')).length,
      wholeHeroEligible: eligible.filter(t => t.slot === 'HERO').length,
      slotEligible: eligible.filter(t => t.slot !== 'HERO').length, totalEligible: eligible.length,
      additionalExcludedTasks: tasks.filter(t => t.priorPairingEligible && !t.trainingEligible).length},
    rows, tasks, limitations: ['Training eligibility is not source-mechanism completeness or playable certification.',
      'Adopted native demonstrations use existing adoption evidence plus version conflicts already excluded; not a new exhaustive 90-slot manual audit.',
      'Excluded conservative risks are not all proven engine defects; no source/content/engine edits.',
      'Known near-duplicate families must be split together; old test appearances become seen regressions if trained.']};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pairs, verified, out] = process.argv.slice(2).map(p => path.resolve(p));
  assert(pairs && verified && out && process.argv.length === 5, 'USAGE: PAIRS_DIR PROJECTION_VERIFIED_DIR NEW_JSON');
  assert(!fs.existsSync(out), 'OUTPUT_ALREADY_EXISTS');
  const manifest = JSON.parse(fs.readFileSync(path.join(pairs, 'manifest.json')));
  const read = name => { const bytes = fs.readFileSync(path.join(pairs, name)); assert.equal(sha(bytes), manifest.outputs[name]); return JSON.parse(bytes); };
  const reportBytes = fs.readFileSync(path.join(verified, 'report.json'));
  const previous = JSON.parse(fs.readFileSync(path.join(verified, '../verification.json')));
  const compiledBytes = fs.readFileSync(path.join(verified, 'compiled.json'));
  assert.equal(sha(compiledBytes), previous.outputs['projection-verified/compiled.json']);
  const result = qualify(read('heroes.json'), read('examples.json'), read('artifacts.json'), JSON.parse(compiledBytes),
    JSON.parse(reportBytes), previous.outputs['projection-verified/report.json'], sha(reportBytes));
  Object.assign(result, {pairManifestSha256: sha(fs.readFileSync(path.join(pairs, 'manifest.json'))),
    compileReportSha256: sha(reportBytes), scriptSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url)))});
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(result.counts));
}
