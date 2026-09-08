/** Prove selected IR limitations are NOT evidence of missing engine primitives. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha } from './intake.mjs';
import { ACTIONS } from './semantic-ir.mts';
import { checkEnginePins } from './ir-compiler.mts';
import { zEffectDef } from '../../GGD-community-hero-forge/packages/shared/src/content/schema/effect.ts';
import { comboStrikeOffsets } from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/comboStrikes.ts';
import { COMBO_MAX_STRIKES } from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/kindLimits.ts';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
assert.equal(process.argv.length, 3); const out = path.resolve(process.argv[2]);
assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
checkEnginePins();
const proposals: any[] = [
  { id: 'combo-27', heroes: ['community37-19'], slots: ['EX'], engineCandidate: {
    kind: 'comboStrikes', shape: 'single', strikes: 27, intervalSec: 0.1,
    perStrike: [{ kind: 'damage', damageType: 'physical', amount: { flat: 1 } }], stopOnCasterDeath: true,
  }, missingInIR: 'combo.strikes is capped at 20; current IR also always adds a separate finisher and lacks per-strike spatial/interruption policy.',
    remaining: '27 scheduler entries alone do NOT prove distance recheck, interruption, total damage budget or full Kirito behavior.' },
  { id: 'damage-breakable-control', heroes: ['community37-26'], slots: ['W'], engineCandidate: {
    kind: 'applyStatus', statusId: 'research12b.sleep', duration: 1, stun: true, breakOnDamage: true, breakOnDamageMin: 0,
  }, missingInIR: 'control permits root/stun/fear/slow but no breakOnDamage field; plain stun loses the mandatory wake-up behavior.',
    remaining: 'Need source-mapped projectile, hit/wake/shield/control coexistence tests; the candidate is not a whole skill or visual sleep label.' },
  { id: 'carry-one-enemy', heroes: ['community37-06', 'community37-15'], slots: ['Q'], engineCandidate: {
    kind: 'carry', shape: 'circle', radius: 2.5, side: 'enemies', maxTargets: 1, durationSec: 1, onCarrierDeath: 'release',
  }, missingInIR: 'No carry operation. Engine has enemy-side, cap and release-on-carrier-death fields.',
    remaining: 'Not proof of Kirby cone suction, carrying sample, W release, wrestler paired animation or copy whitelist.' },
  { id: 'timed-form', heroes: ['community37-09', 'community37-11', 'community37-16'], slots: ['R', 'E'], engineCandidate: {
    kind: 'championForm', to: 'alternate', durationSec: 3,
  }, missingInIR: 'No championForm operation. The engine effect refers to an authored counterpart, not an arbitrary model-invented target body.',
    remaining: 'Still need legal counterpart documents, identity-specific slot changes and cooldown/resource-preservation behavior tests.' },
  { id: 'bounded-proxy-cast', heroes: ['community37-01', 'community37-11'], slots: ['EX'], engineCandidate: {
    kind: 'proxyCast', shape: 'single', slot: 'Q', payCosts: 'manaAndCooldown', respectCooldown: true,
    requireLearned: true, targetMode: 'inherit', maxDepth: 0,
  }, missingInIR: 'No proxyCast operation. The engine has bounded cast forwarding with explicit cost/cooldown policy.',
    remaining: 'Does NOT establish summon-as-caster or dynamic copy-sample whitelisting; do not equate the old proxy-cast template family with this effect.' },
];
for (const p of proposals) zEffectDef.parse(p.engineCandidate);
const combo = proposals[0].engineCandidate, offsets = comboStrikeOffsets(combo, 1 / 30);
assert.equal(offsets.length, 27); assert(offsets.every((n, i) => i === 0 || n > offsets[i - 1]));
assert(COMBO_MAX_STRIKES >= 27);
const ir27 = { op: 'combo', evidence: '二十七連擊', damageType: 'physical', tier: null,
  strikes: 27, duration: 3, lock: 'none', casterGuard: 'none', finisherTier: null };
assert.equal(ACTIONS.combo.safeParse(ir27).success, false);
assert.equal(ACTIONS.control.safeParse({ op: 'control', evidence: '傷害提前喚醒', control: 'stun', duration: 1,
  slowPct: null, breakOnDamage: true }).success, false);
checkEnginePins();
const evidence = [
  'packages/shared/src/content/schema/effects/comboStrikes.ts', 'packages/shared/src/sim/effects/comboStrikes.ts',
  'packages/shared/src/sim/effects/kindLimits.ts', 'packages/shared/src/content/schema/effects/applyStatus.ts',
  'packages/shared/src/sim/statusBreak.ts', 'packages/shared/src/sim/statusBreak.test.ts',
  'packages/shared/src/sim/effects/variants/carry.ts', 'packages/shared/src/sim/effects/carry.ts',
  'packages/shared/src/sim/effects/variants/championForm.ts', 'packages/shared/src/sim/systems/ChampionFormSystem.ts',
  'packages/shared/src/sim/effects/variants/proxyCast.ts',
];
const receipt = { schema: 'ggd-hero12b-ir-capability-boundaries@1', generatedAt: new Date().toISOString(),
  assertions: { legalEngineCandidateShapes: 5, scheduledCombo27Entries: offsets.length, comboEngineMaximum: COMBO_MAX_STRIKES,
    irRejects27: true, irRejectsDamageBreakField: true, enginePinsMatched: true },
  scope: 'structural capability and combo-scheduler check; NOT full engine behavior or hero qualification',
  priorCpuAttempt: 'The first carry candidate used single with side/maxTargets, rejected as inert fields by the real cross-field validator. Corrected research fixture to circle with radius; no engine change or model blame.',
  cases: proposals, offsets,
  pins: [...evidence.map(p => path.join(root, 'GGD-community-hero-forge', p)), fileURLToPath(import.meta.url), path.join(here, 'semantic-ir.mts')]
    .map(p => ({ path: path.relative(root, p), sha256: sha(fs.readFileSync(p)) })),
  trainingAdmitted: false, releaseQualified: false, modelFailureInferred: false };
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt.assertions, null, 2));
