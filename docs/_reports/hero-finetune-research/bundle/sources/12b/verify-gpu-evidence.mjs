import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(fs.readFileSync(path.join(here, p), 'utf8'));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const run = 'development-smoke-v2', raw = read(`${run}/raw.json`), state = read(`${run}/state.json`);
const protocol = read(`${run}/manifest.json`), requests = read(`${run}/requests.json`), promptCheck = read(`${run}/prompt-check.json`);
const preflight = read('gpu-preflight-v1.json'), compat = read('lora-compat-v2/result.json'), compatState = read('lora-compat-v2/state.json');
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null);
assert.equal(compatState.status, 'completed-compatibility-only'); assert.equal(compatState.workerPid, null);
assert.equal(fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'), false, 'SHARED_GPU_LOCK_STILL_PRESENT');
assert.equal(raw.results.length, 4); assert.equal(raw.complete, true);
assert.equal(sha(JSON.stringify(requests)), protocol.requestSha256);
assert.equal(raw.metadata.requestSha256, protocol.requestSha256);
assert.equal(raw.metadata.manifestSha256, sha(fs.readFileSync(path.join(here, run, 'manifest.json'))));
for (const [name, expected] of Object.entries(state.checkerPinsBeforeInference)) assert.equal(sha(fs.readFileSync(path.join(here, name))), expected);
const outcomes = raw.results.map((r, i) => {
  assert.equal(r.id, requests[i].id); assert.equal(r.requestDigest, requests[i].requestDigest);
  assert.equal(r.promptSha256, promptCheck.promptSha256[i]); assert.equal(r.promptTokens, promptCheck.counts[i]);
  assert.equal(r.envelope.finishReason, 'stop'); assert(r.generationTokens <= protocol.maxTokens);
  return { id: r.id, seconds: r.seconds, generationTokens: r.generationTokens,
    firstTokenSeconds: r.firstTokenSeconds, generationTps: r.generationTps, peakMetalGiB: r.peakMetalBytes / 1024 ** 3,
    normalized: normalizeFinal(r.envelope).ok };
});
assert.equal(outcomes.filter(r => r.normalized).length, 1);
assert(compat.technicalCompatibilityPassed && compat.steps === 1 && compat.modelPromotionAllowed === false);
assert.equal(compat.baseLoss, compat.zeroAdapterLoss); assert.equal(compat.afterLoss, compat.reloadedLoss);
assert(compat.gradientNorm > 0 && Object.values(compat.maxAbsoluteParameterChanges).some(v => v > 0));
assert.equal(sha(fs.readFileSync(path.join(here, 'lora-compat-v2/adapters.safetensors'))), compat.adapterSha256);
assert.equal(sha(fs.readFileSync(path.join(here, 'lora-compat.py'))), compat.workerSha256);
const headerFile = fs.readFileSync(path.join(here, 'lora-compat-v2/adapters.safetensors'));
const headerSize = Number(headerFile.readBigUInt64LE(0));
const header = JSON.parse(headerFile.subarray(8, 8 + headerSize).toString('utf8'));
assert.deepEqual(Object.keys(header).filter(k => k !== '__metadata__').sort(), [...compat.trainedKeys].sort());
assert(compat.trainedKeys.every(k => /\.layers\.47\.self_attn\.(q_proj|o_proj)\.lora_[ab]$/.test(k)));
const modelFiles = [];
for (const p of preflight.files) {
  const file = path.join(preflight.modelDirectory, p.name), hash = crypto.createHash('sha256');
  assert.equal(fs.statSync(file).size, p.bytes);
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
  assert.equal(hash.digest('hex'), p.sha256, `BASE_WEIGHT_CHANGED:${p.name}`);
  modelFiles.push(p.name);
}
const resourceReport = s => ({ seconds: s.finishedAt - s.startedAt, samples: s.samples.length,
  minAvailableGiB: Math.min(...s.samples.map(v => v.availableBytes)) / 1024 ** 3,
  swapGrowthGiB: (Math.max(s.preflight.swapUsedBytes, ...s.samples.map(v => v.swapUsedBytes)) - s.preflight.swapUsedBytes) / 1024 ** 3,
  batteryStart: s.preflight.batteryPercent, minimumBattery: Math.min(...s.samples.map(v => v.batteryPercent)),
  allSamplesAC: s.samples.every(v => v.acPower) });
const result = { schema: 'ggd-hero12b-gpu-evidence-verification@1', generatedAt: new Date().toISOString(),
  baseline: { rawSha256: sha(fs.readFileSync(path.join(here, run, 'raw.json'))), outcomes, resources: resourceReport(state),
    acceptedHeroes: 0, independentTest: false },
  loraTechnicalSmoke: { trainedParameters: compat.trainableParameters, steps: 1,
    stepSeconds: compat.stepSeconds, peakMetalGiB: compat.peakMetalBytes / 1024 ** 3,
    baseLoss: compat.baseLoss, afterLoss: compat.afterLoss, adapterRoundtrip: true,
    resources: resourceReport(compatState), fullHeroQualityMeasured: false, promotionAllowed: false },
  originalModelFilesRehashedUnchanged: modelFiles, ownGpuWorkersFinished: true, sharedLockReleased: true,
  releaseQualified: false, verifierSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) };
fs.writeFileSync(path.join(here, 'GPU_VERIFICATION_V1.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
