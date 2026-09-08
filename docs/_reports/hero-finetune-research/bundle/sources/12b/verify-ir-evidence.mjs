import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sha } from './intake.mjs';
import { normalizeFinal } from './normalize.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 4, 'USAGE: node verify-ir-evidence.mjs RUN NEW_JSON_REPORT');
const run = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(output), here); assert(!fs.existsSync(output), 'REFUSE_OVERWRITE');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const protocol = read(path.join(run, 'manifest.json')), state = read(path.join(run, 'state.json'));
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null);
const raw = read(path.join(run, 'raw.json')), requests = read(path.join(run, 'requests.json'));
assert(raw.complete); assert.equal(raw.results.length, protocol.heroCount); assert.equal(sha(requests), protocol.requestSha256);
assert.equal(sha(fs.readFileSync(path.join(run, 'manifest.json'))), raw.metadata.manifestSha256);
assert.equal(sha(fs.readFileSync(path.join(here, 'gpu-smoke.py'))), raw.metadata.workerSha256);
assert.deepEqual(protocol.checkerPins, state.checkerPinsBeforeInference);
for (const [f, h] of Object.entries(protocol.checkerPins)) assert.equal(sha(fs.readFileSync(path.join(here, f))), h, `CHECKER_DRIFT:${f}`);
const prompt = read(path.join(run, 'prompt-check.json'));
for (const [i, r] of raw.results.entries()) {
  assert.equal(r.id, requests[i].id); assert.equal(r.requestDigest, requests[i].requestDigest);
  assert.equal(r.promptSha256, prompt.promptSha256[i]); assert.equal(r.promptTokens, prompt.counts[i]);
}
const model = read(path.join(here, 'gpu-preflight-v1.json')), modelFiles = [];
for (const p of model.files) {
  const actual = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(model.modelDirectory, p.name))) actual.update(chunk);
  assert.equal(actual.digest('hex'), p.sha256, `BASE_MODEL_CHANGED:${p.name}`);
  modelFiles.push({ name: p.name, unchanged: true });
}
const lock = '/private/tmp/ggd-forge-training-runtime/gpu.lock';
const samples = [state.preflight, ...state.samples];
const evidence = { schema: 'ggd-hero12b-ir-evidence@1', generatedAt: new Date().toISOString(), run: path.basename(run),
  originalModelFilesUnchanged: modelFiles, pinnedArtifactsVerified: true,
  supervisedSeconds: state.finishedAt - state.startedAt, loadSeconds: raw.metadata.loadSeconds,
  ownWorkerFinished: true, sharedGpuLockAbsentAtVerification: !fs.existsSync(lock),
  resources: { samples: samples.length, acAllSamples: samples.every(s => s.acPower),
    minimumBatteryPercent: Math.min(...samples.map(s => s.batteryPercent)), minimumAvailableGiB: Math.min(...samples.map(s => s.availableBytes)) / 2**30,
    initialSwapGiB: samples[0].swapUsedBytes / 2**30, maxSwapGrowthGiB: (Math.max(...samples.map(s => s.swapUsedBytes)) - samples[0].swapUsedBytes) / 2**30 },
  results: raw.results.map(r => ({ id: r.id, seconds: r.seconds, firstTokenSeconds: r.firstTokenSeconds,
    promptTokens: r.promptTokens, generationTokens: r.generationTokens, generationTps: r.generationTps,
    peakMetalGiB: r.peakMetalBytes / 2**30, finishReason: r.envelope.finishReason, jsonValid: normalizeFinal(r.envelope).ok })),
  modelPromoted: false, training: false, releaseQualified: false };
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(evidence, null, 2));
